"""Combined Stage 2 handoff manifest, parity, guardrail, and arithmetic verifier."""

import copy
import re
from decimal import Decimal


CANONICAL_CHAPTER_DUTIES = {
    "CHAPTER_HEAD",
    "FINANCE",
    "INVENTORY",
    "PURCHASING",
    "BUDGET_APPROVER",
    "RECEIVING",
    "DISPATCH",
    "SALES_ORDER",
    "CASHIER",
    "BOOTH_OPERATOR",
    "COMMITTEE_REQUESTER",
    "RF_APPROVER",
    "COUNT_VERIFIER",
    "INDEPENDENT_REVIEWER",
}

EXPECTED_STAGE1_EVIDENCE_PURPOSES = {"opening_receipt", "hold_clearance", "actual_issue"}
EXPECTED_STAGE2_EVIDENCE_PURPOSES = {
    "quotation_attachment",
    "po_supplier_dr",
    "da_acknowledgment",
    "da_receipt",
    "donor_restriction_resolution",
    "receiving_discrepancy",
    "missing_source_hold",
}
EXPECTED_STAGE2_POLICIES = {
    "purchasing_quotation_policy",
    "da_authorization",
    "reference_series_repf",
    "reference_series_po",
    "reference_series_da",
}
EXPECTED_STAGE1_REUSED_POLICIES = {
    "valuation_rounding",
    "rop",
    "target_level",
    "quantity_scale",
    "allocation_priority",
    "reference_series_rm_shared",
}
EXPECTED_REFERENCE_FAMILIES = {
    "opening",
    "internal_rf",
    "actual_issue",
    "repf",
    "purchase_order",
    "donation_acknowledgment",
}
EXPECTED_INTERNAL_PARTICIPANTS = {
    "checkEvidenceBinding": ("x-stage2-evidence-participants", "Leader"),
    "computeNetShortageSnapshot": ("x-stage2-shortage-participants", "Glenn"),
    "applyLotRestrictionResolution": ("x-stage2-donation-participants", "Efren"),
    "prepareReceivingInventory": ("x-stage2-receiving-participants", "Efren"),
}
EXPECTED_STAGE2_EVENTS = {
    "stage2.repf.changed.v1",
    "stage2.purchase-order.changed.v1",
    "stage2.donation.changed.v1",
    "stage2.receiving-report.changed.v1",
    "stage2.receiving-discrepancy.changed.v1",
    "stage2.receiving-hold.changed.v1",
}
EXPECTED_CO_EMITTED_STAGE1_EVENTS = {
    "stage1.stock-lot.changed.v1",
    "stage1.internal-rf.changed.v1",
    "stage1.chapter-setup.changed.v1",
    "stage1.authority.changed.v1",
}
FORBIDDEN_STAGE3_PLUS_FRAGMENTS = (
    "/policies",
    "/settings",
    "/record-policy",
    "/evidence-readiness",
    "/readiness-token",
    "/compute-net-shortage",
    "/prepare-receiving",
    "/apply-lot-restriction",
    "/suppliers",
    "/alerts/ack",
    "/alerts/dismiss",
    "/reports/finance",
    "/reports/booth",
    "/export",
    "/sales-orders",
    "/sales-invoices",
    "/payments",
    "/official-receipts",
    "/booths",
    "/adjustments",
    "/adj",
)
FORBIDDEN_BINARY_MEDIA_TYPES = {
    "application/pdf",
    "text/csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def heading_anchors(markdown_path):
    """Compute GitHub-style heading anchors from a Markdown document."""
    anchors = set()
    counts = {}
    for line in markdown_path.read_text(encoding="utf-8").splitlines():
        if not line.startswith("#"):
            continue
        text = line.lstrip("#").strip()
        text = re.sub(r"`([^`]*)`", r"\1", text)
        text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
        slug = re.sub(r"[^\w\s-]", "", text.lower(), flags=re.UNICODE)
        slug = slug.replace(" ", "-").strip("-")
        if slug in counts:
            counts[slug] += 1
            anchors.add(f"{slug}-{counts[slug]}")
        else:
            counts[slug] = 0
            anchors.add(slug)
    return anchors


def check_agreement_link(link, doc_anchors, label):
    require("#" in link, f"Missing anchor in agreement link ({label}): {link}")
    filename, anchor = link.split("#", 1)
    require(filename in doc_anchors, f"Unknown agreement document ({label}): {filename}")
    require(anchor in doc_anchors[filename], f"Unknown agreement anchor ({label}): {link}")


def validate_handoff(root, handoff, document, examples, events, operations):
    """Verify 100% parity across handoff.yaml, openapi.yaml, agreement.md, events.yaml, and examples.yaml."""
    doc_anchors = {
        "agreement.md": heading_anchors(root / "agreement.md"),
        "notifications.md": heading_anchors(root / "notifications.md"),
        "handoff.md": heading_anchors(root / "handoff.md"),
    }
    cases = {case["name"]: case for case in examples["cases"]}
    proc_cases = {case["name"]: case for case in examples.get("procedure_cases", [])}
    part_cases = {case["name"]: case for case in examples.get("participant_cases", [])}
    all_case_names = cases.keys() | proc_cases.keys() | part_cases.keys()

    require(handoff.get("spec") == "https://github.com/Kamunggay/YSP/issues/27", "Wrong parent spec URL in handoff")
    require("pending" in str(handoff.get("status", "")).lower(), "Handoff status must state pending human review")

    # 1. Verify action duties registry (all 39 entries, canonical duties only, 100% used)
    action_duties = document.get("x-stage2-action-duties", {})
    require(bool(action_duties), "Missing x-stage2-action-duties in OpenAPI")
    require(
        handoff.get("action_duties") == action_duties,
        "handoff.yaml action_duties differs from openapi.yaml x-stage2-action-duties",
    )
    for action_name, duties in action_duties.items():
        require(bool(duties) and set(duties) <= CANONICAL_CHAPTER_DUTIES,
                f"Non-canonical duty in x-stage2-action-duties/{action_name}: {duties}")

    # 2. Verify every HTTP operation maps to Section 7 owner, Glenn UI, reciprocal reviewers, action duty & event disposition
    listed = set()
    used_actions = set()
    event_dispositions = events["operation_disposition"]
    for profile_name, profile in handoff["profiles"].items():
        for field in (
            "owner",
            "ui_consumer",
            "reviewers",
            "existence",
            "agreement",
            "requirements",
            "source_nodes",
            "coverage_limit",
            "operations",
        ):
            require(bool(profile.get(field)), f"Missing handoff profile {profile_name}/{field}")
        owner = profile["owner"]
        require(owner in {"Leader", "Glenn"}, f"Invalid Section 7 backend owner on {profile_name}: {owner}")
        require(profile["ui_consumer"] == "Glenn", f"Stage 2 UI consumer must be Glenn on {profile_name}")
        reviewers = set(profile["reviewers"])
        require("Efren" in reviewers, f"Efren missing from reviewers on {profile_name}")
        if owner == "Glenn":
            require("Leader" in reviewers, f"Leader missing from reciprocal reviewers on Glenn profile {profile_name}")
        else:
            require("Glenn" in reviewers, f"Glenn missing from reciprocal reviewers on Leader profile {profile_name}")
        require(profile["existence"] == "specified_only", f"Stage 2 profile existence must be specified_only: {profile_name}")
        check_agreement_link(profile["agreement"], doc_anchors, f"profile:{profile_name}")

        for op_id, entry in profile["operations"].items():
            require(op_id not in listed, f"Duplicate handoff operation: {op_id}")
            require(op_id in operations, f"Unknown handoff operation: {op_id}")
            listed.add(op_id)
            pointer, operation = operations[op_id]
            escaped_path = entry["path"].replace("~", "~0").replace("/", "~1")
            require(
                pointer == f"#/paths/{escaped_path}/{entry['method'].lower()}",
                f"Handoff method/path differs for {op_id}",
            )
            require(operation.get("x-existence") == "new", f"Expected x-existence: new on {op_id}")
            require(operation.get("x-owner") == owner, f"OpenAPI x-owner differs from handoff on {op_id}")
            if "x-ui-consumer" in operation:
                require(operation["x-ui-consumer"] == profile["ui_consumer"], f"x-ui-consumer differs on {op_id}")
            if "x-reviewers" in operation:
                require(set(operation["x-reviewers"]) == reviewers, f"x-reviewers differs on {op_id}")

            req_action = operation.get("x-required-action")
            require(req_action in action_duties, f"Unknown x-required-action on {op_id}: {req_action}")
            require(entry.get("required_action") == req_action, f"Handoff required_action differs on {op_id}")
            used_actions.add(req_action)

            require(op_id in event_dispositions, f"Operation missing from events.yaml disposition: {op_id}")
            ev_disp = event_dispositions[op_id]
            emits = sorted(ev_disp.get("events", []))
            if emits:
                require(
                    entry.get("events_disposition") == "emits"
                    and sorted(entry.get("emits", [])) == emits,
                    f"Handoff events_disposition/emits mismatch on {op_id}",
                )
            else:
                require(
                    entry.get("events_disposition") == "none"
                    and bool(ev_disp.get("reason"))
                    and entry.get("no_event_reason") == ev_disp["reason"]
                    and entry.get("emits", []) == [],
                    f"Handoff no-event disposition mismatch on {op_id}",
                )

    require(listed == operations.keys(), f"Handoff operation inventory differs: {sorted(listed ^ operations.keys())}")
    require(used_actions == action_duties.keys(), f"Unused x-stage2-action-duties: {sorted(action_duties.keys() - used_actions)}")

    # 3. Verify controlled procedures and internal participants (zero public HTTP routes)
    procedures = document.get("x-controlled-procedures", {})
    require(handoff["controlled_procedures"].keys() == procedures.keys(), "Controlled procedures inventory differs")
    for proc_id, entry in handoff["controlled_procedures"].items():
        require(entry["canonical"] == f"openapi.yaml#/x-controlled-procedures/{proc_id}", f"Bad procedure ref: {proc_id}")
        require(entry["owner"] == "Leader" and entry.get("public_http_route") is False, f"Bad procedure ownership: {proc_id}")
        check_agreement_link(entry["agreement"], doc_anchors, f"procedure:{proc_id}")

    actual_participants = {}
    for pid, (ext, expected_owner) in EXPECTED_INTERNAL_PARTICIPANTS.items():
        group = document.get(ext, {})
        require(pid in group, f"Missing expected internal participant {pid} in {ext}")
        actual_participants[pid] = (ext, group[pid], expected_owner)
    require(
        handoff["internal_participants"].keys() == actual_participants.keys(),
        "Internal participants inventory differs",
    )
    for pid, entry in handoff["internal_participants"].items():
        ext, canonical, expected_owner = actual_participants[pid]
        require(entry["canonical"] == f"openapi.yaml#/{ext}/{pid}", f"Bad participant canonical ref: {pid}")
        require(entry["owner"] == canonical.get("owner") == expected_owner, f"Participant owner mismatch: {pid}")
        require(entry.get("commit") == "caller_owned_single_mysql_transaction", f"Bad participant commit boundary: {pid}")
        require(entry.get("public_http_route") is False, f"Participant must declare public_http_route: false: {pid}")
        require(pid not in operations, f"Internal participant exposed as public HTTP operation: {pid}")
        check_agreement_link(entry["agreement"], doc_anchors, f"participant:{pid}")

    # 4. Verify policies, reference_series families, EvidencePurpose, events, compatibility & error codes
    require(
        set(document["x-stage2-policy-values"].keys()) == EXPECTED_STAGE2_POLICIES
        and set(handoff["policies"]["stage2_new"].keys()) == EXPECTED_STAGE2_POLICIES,
        "Stage 2 new policy keys mismatch",
    )
    require(
        set(document["x-stage1-reused-policy-values"].keys()) == EXPECTED_STAGE1_REUSED_POLICIES
        and set(handoff["policies"]["stage1_reused"].keys()) == EXPECTED_STAGE1_REUSED_POLICIES,
        "Stage 1 reused policy keys mismatch",
    )
    ref_families = document["x-reference-series-policy-identity"]["families"]
    require(
        set(ref_families.keys()) == EXPECTED_REFERENCE_FAMILIES
        and set(handoff["reference_series_families"].keys()) == EXPECTED_REFERENCE_FAMILIES,
        "reference_series families mismatch",
    )
    ev_enum = set(document["components"]["schemas"]["EvidencePurpose"]["enum"])
    require(
        ev_enum == EXPECTED_STAGE1_EVIDENCE_PURPOSES | EXPECTED_STAGE2_EVIDENCE_PURPOSES
        and set(handoff["evidence_purposes"]["stage1_reused"]) == EXPECTED_STAGE1_EVIDENCE_PURPOSES
        and set(handoff["evidence_purposes"]["stage2_added"]) == EXPECTED_STAGE2_EVIDENCE_PURPOSES,
        "EvidencePurpose registry mismatch",
    )
    require(
        set(events["definitions"].keys()) == EXPECTED_STAGE2_EVENTS
        and set(handoff["events"]["stage2_events"]) == EXPECTED_STAGE2_EVENTS
        and set(events["co_emitted_stage1_events"].keys()) == EXPECTED_CO_EMITTED_STAGE1_EVENTS
        and set(handoff["events"]["co_emitted_stage1_events"]) == EXPECTED_CO_EMITTED_STAGE1_EVENTS
        and handoff["events"]["synthetic_alert_events"] == [],
        "Stage 2 events registry mismatch",
    )
    check_agreement_link(handoff["events"]["agreement"], doc_anchors, "events")
    require(
        set(handoff["stage1_compatibility"].keys()) == set(document["x-stage1-compatibility"].keys()),
        "Stage 1 compatibility inventory mismatch",
    )
    conflict_codes = set(document["components"]["schemas"]["Stage2ConflictCode"]["enum"])
    require(
        set(handoff["error_and_blocker_codes"]["conflict_409"]) == conflict_codes,
        "Stage2ConflictCode registry mismatch",
    )

    # 5. Stage 3+ scope leak guardrails (paths, enums, media types, deferred reporting)
    for path_str, path_item in document["paths"].items():
        lowered = path_str.lower()
        for fragment in FORBIDDEN_STAGE3_PLUS_FRAGMENTS:
            require(fragment not in lowered, f"Forbidden Stage 3+ or internal path leaked: {path_str}")
        for method, operation in path_item.items():
            if method not in {"get", "post", "put", "patch", "delete"}:
                continue
            for resp in operation.get("responses", {}).values():
                media_types = set(resp.get("content", {}).keys())
                require(not (media_types & FORBIDDEN_BINARY_MEDIA_TYPES),
                        f"Forbidden Stage 3+/RPT-07 binary media type leaked on {operation['operationId']}: {media_types}")
    require(
        document["components"]["schemas"]["RepfTriggerKind"]["enum"] == ["rf_shortage", "rop_replenishment"],
        "RepfTriggerKind leaked Stage 3 so_shortage or unexpected trigger",
    )
    require(
        document["components"]["schemas"]["ReceivingSourceKind"]["enum"] == ["po", "da"],
        "ReceivingSourceKind leaked forbidden source kind",
    )
    deferred_rep = document.get("x-stage2-deferred-reporting", {})
    require(
        deferred_rep.get("finance_and_booth_reports", {}).get("requirement") == "RPT-05"
        and deferred_rep.get("binary_pdf_csv_exports", {}).get("requirement") == "RPT-07",
        "x-stage2-deferred-reporting must explicitly defer RPT-05 and RPT-07",
    )

    # 6. Complete PRD/TRD requirement disposition coverage
    expected_reqs = (
        {f"PRC-{n:02}" for n in range(1, 10)}
        | {f"RCV-{n:02}" for n in range(1, 14)}
        | {f"INV-{n:02}" for n in range(9, 15)}
        | {f"RPT-{n:02}" for n in range(1, 8)}
        | {f"RF-{n:02}" for n in range(5, 9)}
        | {f"GOV-{n:02}" for n in range(1, 10)}
        | {f"SEC-{n:02}" for n in range(1, 4)}
        | {f"DOC-{n:02}" for n in range(1, 12)}
        | {"AC-07", "AC-12", "AC-14", "AC-15", "AC-16", "ADD-AC-11"}
    )
    coverage = handoff["requirement_coverage"]
    require(
        coverage.keys() == expected_reqs,
        f"Requirement coverage inventory differs: {sorted(coverage.keys() ^ expected_reqs)}",
    )
    for req_id, entry in coverage.items():
        require(
            entry["disposition"] in {"stage2_contract", "partial", "later_stage"}
            and bool(entry.get("scope"))
            and bool(entry.get("profiles"))
            and set(entry["profiles"]) <= handoff["profiles"].keys(),
            f"Invalid requirement disposition: {req_id}",
        )
    for later_req in ("RPT-05", "RPT-07", "GOV-06", "GOV-07"):
        require(coverage[later_req]["disposition"] == "later_stage", f"{later_req} must remain later_stage")

    # 7. Verify linked journeys, example categories, and cross-case worked arithmetic
    for jname, journey in handoff["journeys"].items():
        require(
            bool(journey.get("fixture"))
            and bool(journey.get("cases"))
            and set(journey["cases"]) <= all_case_names,
            f"Unknown journey example or fixture in {jname}",
        )
    for cname, names_list in handoff["example_categories"].items():
        require(bool(names_list) and set(names_list) <= all_case_names, f"Unknown example category case: {cname}")

    validate_worked_stage2_arithmetic(cases, part_cases)
    print(
        f"PASS combined Stage 2 handoff: {len(listed)} HTTP; {len(action_duties)} action duties; "
        f"{len(actual_participants)} internal participants; {len(EXPECTED_STAGE2_POLICIES)} Stage 2 policies; "
        f"{len(coverage)} requirement dispositions; {len(handoff['journeys'])} linked journeys; "
        "scope guardrails & cross-case arithmetic"
    )


def validate_worked_stage2_arithmetic(cases, part_cases):
    """Cross-check linked Stage 2 worked journeys (PO 100 / RM 40+10+60, DA mixed SKU, INV-09/ADR 0004)."""
    # 1. PO 100 / RM-1 (40 accepted + 10 rejected) -> open discrepancy -> RM-2 (60 replacement) -> resolved + recovery
    rm1_receipt = cases["stage2-05-rm-post-po-partial-40-accepted-10-rejected"]["response"]["body"]["data"]
    rm1_recovered = cases["stage2-05-recovery-by-key-post-rm"]["response"]["body"]["data"]
    require(rm1_receipt == rm1_recovered, "Recovered postReceivingReport receipt differs from original commit")

    rm1 = rm1_receipt["result"]
    rm1_line = rm1["lines"][0]
    require(
        Decimal(rm1_line["delivered_quantity"]) == Decimal("50")
        and Decimal(rm1_line["accepted_quantity"]) == Decimal("40")
        and Decimal(rm1_line["damaged_quantity"]) == Decimal("0")
        and Decimal(rm1_line["rejected_quantity"]) == Decimal("10")
        and rm1_receipt["posting"]["source_status_after"] == "partially_received"
        and len(rm1_receipt["posting"]["created_discrepancy_ids"]) == 1,
        "Worked PO partial receipt 40 accepted / 10 rejected mismatch",
    )

    part_po = part_cases["stage2-05-participant-prepare-receiving-po-partial"]["output"]
    usable_qty = sum((Decimal(lot["quantity"]) for lot in part_po["usable_lots"]), Decimal("0"))
    rejected_qty = sum((Decimal(lot["quantity"]) for lot in part_po["quarantined_or_rejected_lots"]), Decimal("0"))
    require(
        usable_qty == Decimal("40")
        and rejected_qty == Decimal("10")
        and all(lot["immediately_allocatable"] is True for lot in part_po["usable_lots"])
        and all(lot["immediately_allocatable"] is False for lot in part_po["quarantined_or_rejected_lots"])
        and Decimal(part_po["source_line_updates"][0]["new_outstanding_quantity"]) == Decimal("60")
        and part_po["source_line_updates"][0]["new_source_status"] == "partially_received"
        and part_po["emit_stock_lot_changed_event"] is True,
        "Efren prepareReceivingInventory PO 40+10/60-open arithmetic mismatch",
    )

    rm2_receipt = cases["stage2-05-rm-post-po-replacement-second-rm"]["response"]["body"]["data"]
    rm2 = rm2_receipt["result"]
    rm2_line = rm2["lines"][0]
    require(
        rm2["id"] != rm1["id"]
        and rm2["source_id"] == rm1["source_id"]
        and Decimal(rm1_line["accepted_quantity"]) + Decimal(rm2_line["accepted_quantity"]) == Decimal("100")
        and rm2_receipt["posting"]["source_status_after"] == "receiving_complete",
        "Replacement PO-RM must be a new RM completing 40 + 60 = 100",
    )

    disc_resolved = cases["stage2-05-discrepancy-resolve-po-replacement"]["response"]["body"]["data"]["result"]
    require(
        disc_resolved["id"] == rm1_receipt["posting"]["created_discrepancy_ids"][0]
        and disc_resolved["status"] == "resolved"
        and disc_resolved["quarantined_lots_auto_cleared_on_source_close"] is False
        and disc_resolved["resolution"]["resolution_kind"] == "supplier_replacement_received"
        and disc_resolved["resolution"]["replacement_rm_id"] == rm2["id"],
        "Discrepancy resolution must link to the new posted replacement PO-RM",
    )

    # 2. DA-RM mixed restriction shared SKU (bounded + ADR 0004 uninterpreted) & signed restriction resolution
    da_rm = cases["stage2-05-rm-post-da-restricted-and-uninterpreted-shared-sku"]["response"]["body"]["data"]["result"]
    da_variants = {line["variant_id"] for line in da_rm["lines"]}
    da_states = {line["restrictions"]["state"] for line in da_rm["lines"]}
    require(
        len(da_variants) == 1 and da_states == {"bounded", "uninterpreted"},
        "DA-RM mixed-SKU fixture must carry bounded and uninterpreted lines for the same variant",
    )
    da_resolved = cases["stage2-04-resolve-uninterpreted-to-bounded"]["response"]["body"]["data"]
    require(
        da_resolved["restriction_resolution"]["resolution_kind"] == "apply"
        and da_resolved["restriction_resolution"]["previous_restrictions"]["state"] == "uninterpreted"
        and da_resolved["restriction_resolution"]["restrictions"]["state"] == "bounded",
        "DA restriction resolution must transition uninterpreted -> bounded via signed apply",
    )
    da_audit = cases["stage2-04-audit-inexpressible-condition"]["response"]["body"]["data"]
    require(
        da_audit["restriction_resolution"]["resolution_kind"] == "audit_review"
        and da_audit["restriction_resolution"]["restrictions"]["state"] == "uninterpreted",
        "Inexpressible audit review must keep donor restriction uninterpreted",
    )

    # 3. Allocation queue & reports enforce ADR 0004 uninterpreted unallocatable & non-additive stock categories
    alloc_body = cases["stage2-06-allocation-queue-inv09-mixed-sku"]["response"]["body"]
    require(alloc_body["is_commit_authorization"] is False, "Allocation queue must not authorize commits")
    for row in alloc_body["data"]:
        for src in row["eligible_sources"]:
            require(src["restriction_state"] != "uninterpreted", "Allocation queue leaked uninterpreted lot")
    inv_report = cases["stage2-06-report-inventory-json"]["response"]["body"]
    require(inv_report["stock_category_labels"]["views_are_additive"] is False, "Inventory report views must be non-additive")
    ctrl_report = cases["stage2-06-report-control-json"]["response"]["body"]
    require(
        any(r["restriction"]["state"] == "uninterpreted" and r["allocatable_now"] is False
            for r in ctrl_report["donation_restrictions"]),
        "Control report must demonstrate ADR 0004 uninterpreted row with allocatable_now: false",
    )


def run_handoff_negative_probes(root, handoff, document, examples, events, operations):
    """Prove handoff guardrails reject leaked internal participant routes and Stage 3+ scope."""
    rejections = []

    leaked_internal_doc = copy.deepcopy(document)
    leaked_internal_doc["paths"]["/api/v1/chapters/{chapter_id}/prepare-receiving"] = {"post": {"operationId": "prepareReceivingInventory", "responses": {"200": {"description": "bad"}}}}
    try:
        validate_handoff(root, handoff, leaked_internal_doc, examples, events, operations)
    except ValueError as err:
        rejections.append(f"deliberately leaked internal participant route: rejected ({err})")
    else:
        raise ValueError("Handoff guardrail unexpectedly passed leaked internal participant route")

    leaked_stage3_doc = copy.deepcopy(document)
    leaked_stage3_doc["paths"]["/api/v1/chapters/{chapter_id}/reports/finance"] = {"get": {"operationId": "readFinanceReport", "responses": {"200": {"description": "bad"}}}}
    try:
        validate_handoff(root, handoff, leaked_stage3_doc, examples, events, operations)
    except ValueError as err:
        rejections.append(f"deliberately leaked Stage 3+ RPT-05 finance route: rejected ({err})")
    else:
        raise ValueError("Handoff guardrail unexpectedly passed leaked Stage 3+ route")

    return rejections
