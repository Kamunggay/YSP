"""Validate the canonical Stage 2 OpenAPI 3.1.1 contract and published examples."""

import argparse
import json
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from hashlib import sha256
from importlib.metadata import version
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator, FormatChecker
from openapi_spec_validator import OpenAPIV31SpecValidator, validate
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012

STAGE2_EVIDENCE_PURPOSES = {
    "quotation_attachment",
    "po_supplier_dr",
    "da_acknowledgment",
    "da_receipt",
    "donor_restriction_resolution",
    "receiving_discrepancy",
    "missing_source_hold",
}
STAGE1_EVIDENCE_PURPOSES = {"opening_receipt", "hold_clearance", "actual_issue"}
REQUIRED_STAGE2_ACTIONS = {
    "replenishment.read",
    "repf.read",
    "repf.draft",
    "repf.submit",
    "repf.budget_review",
    "repf.cancel",
    "quotation.read",
    "quotation.manage",
    "quotation.select",
    "po.read",
    "po.draft",
    "po.submit",
    "po.approve",
    "po.acknowledge",
    "po.amend_propose",
    "po.amend_approve",
    "po.close_short",
    "po.cancel",
    "receiving.read",
    "receiving.draft",
    "receiving.inspect",
    "receiving.match_evidence",
    "receiving.post",
    "receiving.cancel",
    "discrepancy.manage",
    "discrepancy.resolve",
    "receiving.hold_manage",
    "allocation_queue.read",
    "alerts.read",
    "reports.inventory.read",
    "reports.procurement.read",
    "reports.control.read",
}
FORBIDDEN_PUBLIC_PATH_FRAGMENTS = (
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
)


class UniqueKeysLoader(yaml.SafeLoader):
    """Reject duplicate YAML keys so published schemas/examples cannot silently shadow."""

    def construct_mapping(self, node, deep=False):
        mapping = {}
        for key_node, value_node in node.value:
            key = self.construct_object(key_node, deep=deep)
            if key in mapping:
                raise ValueError(f"Duplicate YAML key: {key}")
            mapping[key] = self.construct_object(value_node, deep=deep)
        return mapping


def pointer_part(value):
    return str(value).replace("~", "~0").replace("/", "~1")


def read_yaml(path):
    return yaml.load(path.read_text(encoding="utf-8"), Loader=UniqueKeysLoader)


def check_net_need_core(data, total_uncovered_field, label):
    """Verify shared INV-10..INV-12 non-overlapping net-need arithmetic."""
    def qty(field):
        return Decimal(data[field])

    zero = Decimal("0")
    if qty("eligible_usable_stockroom_on_hand") > qty("usable_stockroom_on_hand"):
        raise ValueError(f"{label}: eligible usable stock exceeds usable stockroom on-hand")
    expected_avail = max(zero, qty("eligible_usable_stockroom_on_hand") - qty("active_rf_reservations"))
    if qty("eligible_available_to_allocate") != expected_avail:
        raise ValueError(f"{label}: eligible_available_to_allocate mismatch")
    if qty("gross_rf_shortage_need") != qty("unreserved_approved_rf_shortage"):
        raise ValueError(f"{label}: gross_rf_shortage_need differs from unreserved_approved_rf_shortage")
    expected_inbound = qty("open_repf_quantity") + qty("open_po_inbound_quantity")
    if qty("total_open_inbound_coverage") != expected_inbound:
        raise ValueError(f"{label}: total_open_inbound_coverage mismatch")
    if qty("gross_combined_need") != qty("gross_rf_shortage_need") + qty("gross_rop_replenishment_need"):
        raise ValueError(f"{label}: gross_combined_need overlaps RF shortage and ROP")
    expected_uncovered_rf = max(zero, qty("gross_rf_shortage_need") - expected_inbound)
    remaining_inbound = max(zero, expected_inbound - qty("gross_rf_shortage_need"))
    expected_uncovered_rop = max(zero, qty("gross_rop_replenishment_need") - remaining_inbound)
    if qty("uncovered_rf_shortage_quantity") != expected_uncovered_rf:
        raise ValueError(f"{label}: uncovered_rf_shortage_quantity mismatch")
    if qty("uncovered_rop_replenishment_quantity") != expected_uncovered_rop:
        raise ValueError(f"{label}: uncovered_rop_replenishment_quantity mismatch")
    if qty(total_uncovered_field) != expected_uncovered_rf + expected_uncovered_rop:
        raise ValueError(f"{label}: {total_uncovered_field} mismatch")
    return expected_avail, expected_inbound


def check_replenishment_math(item, label):
    """Verify INV-10..INV-12 non-overlapping exact decimal math on worked examples."""
    def qty(field):
        return Decimal(item[field])

    zero = Decimal("0")
    expected_avail, expected_inbound = check_net_need_core(item, "proposed_uncovered_quantity", label)
    expected_rf_short = max(zero, qty("total_unreserved_approved_rf_demand") - expected_avail)
    if qty("unreserved_approved_rf_shortage") != expected_rf_short:
        raise ValueError(f"{label}: unreserved_approved_rf_shortage mismatch")
    approved_rop = Decimal(item["approved_rop"]) if item["approved_rop"] is not None else None
    expected_breach = approved_rop is not None and qty("usable_stockroom_on_hand") <= approved_rop
    if item["low_stock_breach"] != expected_breach:
        raise ValueError(f"{label}: low_stock_breach indicator mismatch")
    approved_target = Decimal(item["approved_target_level"]) if item["approved_target_level"] is not None else None
    post_rf = qty("eligible_usable_stockroom_on_hand") - qty("active_rf_reservations") - qty("total_unreserved_approved_rf_demand")
    expected_rop_gross = (
        max(zero, approved_target - max(zero, post_rf))
        if expected_breach and approved_target is not None
        else zero
    )
    if qty("gross_rop_replenishment_need") != expected_rop_gross:
        raise ValueError(f"{label}: gross_rop_replenishment_need mismatch")
    counted_sources = sum(
        (Decimal(src["open_quantity"]) for src in item["inbound_sources"] if src["coverage_state"] == "counted"),
        zero,
    )
    excluded_sources = sum(
        (Decimal(src["open_quantity"]) for src in item["inbound_sources"] if src["coverage_state"] != "counted"),
        zero,
    )
    if counted_sources != expected_inbound or excluded_sources != qty("excluded_inbound_quantity"):
        raise ValueError(f"{label}: inbound_sources breakdown does not sum to totals")


def check_donation_evidence(check_value, case, receipt):
    name = case["name"]
    request = case["request"]["body"]
    result = receipt["result"]
    material = case["evidence_material"]
    resolution = receipt["restriction_resolution"]
    binding = resolution or result["acknowledgment"]
    expected = {
        "chapter_id": result["chapter_id"],
        "da_id": result["da_id"],
        "material_version": request["expected_material_version"],
    }

    if resolution:
        material_schema = "DonationRestrictionResolutionMaterial"
        proposal_fields = ("da_line_id", "reason", "resolution_kind", "restrictions")
        expected.update({field: request[field] for field in proposal_fields})
        if any(resolution[field] != request[field] for field in proposal_fields):
            raise ValueError(f"{name}: resolution result differs from the signed proposal")
        expected["previous_restrictions"] = resolution["previous_restrictions"]
    else:
        material_schema = "DonationAcknowledgmentMaterial"
        fields = ("prepared_by", "donor_name", "valuation_policy", "pledged_total_value_php")
        expected.update({field: result[field] for field in fields})
        expected["lines"] = [
            {field: value for field, value in line.items()
             if field not in {"received_quantity", "outstanding_quantity"}}
            for line in result["lines"]
        ]

    check_value("#/components/schemas/" + material_schema, material, name + " signed material")
    # These closed projections use ASCII field names, integer numbers and string decimals.
    snapshot = binding["snapshot"]
    if (
        material != expected
        or snapshot["target"]["record_id"] != expected["da_id"]
        or snapshot["material_version"] != expected["material_version"]
        or snapshot["sha256"] != canonical_sha256(material)
        or binding["binding"] != request["evidence"]
        or binding["signed_at"] != request["signed_at"]
    ):
        raise ValueError(f"{name}: evidence does not match signed DA material and manifest")


def php_line_total(quantity_str, unit_price_str):
    """Multiply exact quantity by PHP unit price and round half-up to scale 2."""
    return (Decimal(quantity_str) * Decimal(unit_price_str)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def check_repf_invariants(repf, label):
    """Verify RepF exact decimal totals, line quantity conservation, trigger uniqueness, and net-need math."""
    total_php = Decimal("0.00")
    trigger_kinds = set()
    any_override = False
    any_demand_canceled = False
    seen_rf_lines = set()
    seen_rop_variants = set()
    per_trigger_totals = {}
    per_variant_totals = {}

    for idx, line in enumerate(repf["lines"]):
        line_label = f"{label}.lines[{idx}]"
        req = Decimal(line["requested_quantity"])
        ordered = Decimal(line["ordered_quantity"])
        canceled = Decimal(line["canceled_quantity"])
        remaining = Decimal(line["remaining_to_order_quantity"])
        if ordered + canceled + remaining != req:
            raise ValueError(f"{line_label}: ordered + canceled + remaining != requested_quantity")
        expected_line_total = php_line_total(line["requested_quantity"], line["estimated_unit_cost_php"])
        if Decimal(line["estimated_line_total_php"]) != expected_line_total:
            raise ValueError(f"{line_label}: estimated_line_total_php mismatch")
        total_php += expected_line_total
        trigger_kinds.add(line["trigger_kind"])
        if line["trigger_kind"] == "rf_shortage":
            if line["rf_line_id"] in seen_rf_lines:
                raise ValueError(f"{line_label}: duplicate rf_line_id within RepF")
            seen_rf_lines.add(line["rf_line_id"])
        else:
            if line["variant_id"] in seen_rop_variants:
                raise ValueError(f"{line_label}: duplicate rop_replenishment variant within RepF")
            seen_rop_variants.add(line["variant_id"])
        if line["additional_purchase_reason"] is not None:
            any_override = True
        if line["linked_demand_canceled"]:
            any_demand_canceled = True

        bd = line["net_need_breakdown"]
        check_net_need_core(bd, "variant_proposed_uncovered_quantity", line_label)
        expected_trigger_uncovered = (
            Decimal(bd["uncovered_rf_shortage_quantity"])
            if line["trigger_kind"] == "rf_shortage"
            else Decimal(bd["uncovered_rop_replenishment_quantity"])
        )
        if Decimal(bd["uncovered_need"]) != expected_trigger_uncovered:
            raise ValueError(f"{line_label}: breakdown uncovered_need does not match trigger_kind")
        if bd["exceeds_uncovered_need"] != (req > expected_trigger_uncovered):
            raise ValueError(f"{line_label}: breakdown exceeds_uncovered_need flag mismatch")

        key = (line["variant_id"], line["trigger_kind"])
        if line["additional_purchase_reason"] is None:
            per_trigger_totals[key] = (
                per_trigger_totals.get(key, (Decimal("0"), expected_trigger_uncovered))[0] + req,
                expected_trigger_uncovered,
            )
            per_variant_totals[line["variant_id"]] = (
                per_variant_totals.get(
                    line["variant_id"], (Decimal("0"), Decimal(bd["variant_proposed_uncovered_quantity"]))
                )[0]
                + req,
                Decimal(bd["variant_proposed_uncovered_quantity"]),
            )

    for (variant_id, trig), (req_sum, cap) in per_trigger_totals.items():
        if req_sum > cap:
            raise ValueError(f"{label}: unapproved {trig} sum exceeds uncovered cap for variant {variant_id}")
    for variant_id, (req_sum, cap) in per_variant_totals.items():
        if req_sum > cap:
            raise ValueError(f"{label}: unapproved combined sum exceeds proposed uncovered cap for variant {variant_id}")

    if Decimal(repf["estimated_total_php"]) != total_php:
        raise ValueError(f"{label}: estimated_total_php does not equal sum of line totals")
    if set(repf["trigger_kinds"]) != trigger_kinds:
        raise ValueError(f"{label}: trigger_kinds does not match distinct line triggers")
    if repf["has_additional_purchase_override"] != any_override:
        raise ValueError(f"{label}: has_additional_purchase_override mismatch")
    if repf["linked_demand_canceled"] != any_demand_canceled:
        raise ValueError(f"{label}: linked_demand_canceled mismatch")
    if repf["status"] in {"approved", "partially_ordered", "ordered"} and Decimal(
        repf["approved_budget_php"]
    ) != total_php:
        raise ValueError(f"{label}: approved_budget_php does not match estimated_total_php")


def check_quotation_invariants(quotation, label):
    """Verify quotation line totals, grand total, and unique repf_line_id per quotation."""
    total_php = Decimal("0.00")
    seen_repf_lines = set()
    for idx, line in enumerate(quotation["lines"]):
        line_label = f"{label}.lines[{idx}]"
        if line["repf_line_id"] in seen_repf_lines:
            raise ValueError(f"{line_label}: duplicate repf_line_id within quotation")
        seen_repf_lines.add(line["repf_line_id"])
        expected_line_total = php_line_total(line["quoted_quantity"], line["unit_price_php"])
        if Decimal(line["line_total_php"]) != expected_line_total:
            raise ValueError(f"{line_label}: line_total_php mismatch")
        total_php += expected_line_total
    if Decimal(quotation["total_amount_php"]) != total_php:
        raise ValueError(f"{label}: total_amount_php does not equal sum of line totals")


def check_supplier_selection_invariants(selection, label):
    """Verify PRC-05 supplier selection quote counts and waiver coherence."""
    ids = selection["comparable_quotation_ids"]
    if selection["selected_quotation_id"] not in ids:
        raise ValueError(f"{label}: selected_quotation_id not in comparable_quotation_ids")
    if selection["comparable_quote_count"] != len(ids):
        raise ValueError(f"{label}: comparable_quote_count mismatch")
    ev = selection["policy_evaluation"]
    if ev["comparable_quote_count"] != len(ids):
        raise ValueError(f"{label}: policy_evaluation.comparable_quote_count mismatch")
    if ev["emergency_waiver_used"] != selection["emergency_waiver_used"]:
        raise ValueError(f"{label}: policy_evaluation.emergency_waiver_used mismatch")
    if selection["emergency_waiver_used"]:
        if not ev["waiver_permitted"] or ev["minimum_quotes_when_waived"] is None:
            raise ValueError(f"{label}: emergency waiver recorded when policy disallows waiver")
        if len(ids) < ev["minimum_quotes_when_waived"]:
            raise ValueError(f"{label}: comparable quotes below policy minimum_quotes_when_waived")
    else:
        if len(ids) < ev["required_minimum_quotes"]:
            raise ValueError(f"{label}: comparable quotes below tier required_minimum_quotes without waiver")


def check_po_amendment_invariants(amend, po, label):
    """Verify PO amendment PHP totals and approver independence."""
    amend_total = sum(
        (php_line_total(ln["ordered_quantity"], ln["unit_price_php"]) for ln in amend["lines"]),
        Decimal("0.00"),
    )
    if Decimal(amend["proposed_total_php"]) != amend_total:
        raise ValueError(f"{label}: amendment proposed_total_php mismatch")
    if amend["status"] == "approved":
        approver = amend["approved_by"]["user_id"]
        if approver in {
            amend["proposed_by"]["user_id"],
            po["preparer"]["user_id"],
            po["originating_repf_preparer"]["user_id"],
        }:
            raise ValueError(f"{label}: amendment approver violates independence")


def check_po_invariants(po, label):
    """Verify PRC-06..PRC-09 PO quantity conservation, PHP totals, independence, and state invariants."""
    zero = Decimal("0")
    total_php = Decimal("0.00")
    any_demand_canceled = False
    all_zero_outstanding = True
    any_accepted = False
    any_closed_short_or_canceled = False

    for idx, line in enumerate(po["lines"]):
        line_label = f"{label}.lines[{idx}]"
        ordered = Decimal(line["ordered_quantity"])
        accepted = Decimal(line["accepted_quantity"])
        closed_short = Decimal(line["closed_short_quantity"])
        canceled = Decimal(line["canceled_quantity"])
        outstanding = Decimal(line["outstanding_quantity"])
        if accepted + closed_short + canceled + outstanding != ordered:
            raise ValueError(
                f"{line_label}: accepted + closed_short + canceled + outstanding != ordered_quantity"
            )
        expected_line_total = php_line_total(line["ordered_quantity"], line["unit_price_php"])
        if Decimal(line["line_total_php"]) != expected_line_total:
            raise ValueError(f"{line_label}: line_total_php mismatch")
        total_php += expected_line_total
        if line["linked_demand_canceled"]:
            any_demand_canceled = True
        if outstanding > zero:
            all_zero_outstanding = False
        if accepted > zero:
            any_accepted = True
        if closed_short > zero or canceled > zero:
            any_closed_short_or_canceled = True

    if Decimal(po["total_amount_php"]) != total_php:
        raise ValueError(f"{label}: total_amount_php does not equal sum of line totals")
    if po["linked_demand_canceled"] != any_demand_canceled:
        raise ValueError(f"{label}: linked_demand_canceled mismatch")
    status = po["status"]
    if status in {"draft", "pending_approval", "returned_for_revision", "rejected"} and any_accepted:
        raise ValueError(f"{label}: pre-issuance PO cannot have accepted receipts")
    if status in {"receiving_complete", "closed_short", "canceled"} and not all_zero_outstanding:
        raise ValueError(f"{label}: terminal PO status {status} must have zero outstanding_quantity")
    if status == "receiving_complete" and any_closed_short_or_canceled:
        raise ValueError(f"{label}: receiving_complete PO cannot have closed_short or canceled quantities")
    if status == "canceled" and any_accepted:
        raise ValueError(f"{label}: canceled PO cannot have accepted receipts")
    preparers = {po["preparer"]["user_id"], po["originating_repf_preparer"]["user_id"]}
    if po["approved_by"] is not None and po["approved_by"]["user_id"] in preparers:
        raise ValueError(f"{label}: PO approver violates independence from PO or originating RepF preparer")
    if po["closed_short_by"] is not None and po["closed_short_by"]["user_id"] in preparers:
        raise ValueError(f"{label}: PO close-short actor violates independence from PO or originating RepF preparer")
    if po["canceled_by"] is not None and po["po_reference"] is not None and po["canceled_by"]["user_id"] in preparers:
        raise ValueError(f"{label}: post-issuance PO cancel actor violates independence")
    if po["pending_amendment"] is not None:
        if po["pending_amendment"]["status"] != "pending_approval":
            raise ValueError(f"{label}: pending_amendment must have status pending_approval")
        check_po_amendment_invariants(po["pending_amendment"], po, label)


def canonical_sha256(obj):
    canonical = json.dumps(obj, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return sha256(canonical.encode("utf-8")).hexdigest()


def is_unrestricted(r):
    return (
        r["state"] == "unrestricted"
        and not r["allowed_uses"]
        and not r["event_ids"]
        and not r["requesting_unit_ids"]
        and r["effective_from"] is None
        and r["effective_until"] is None
        and r["interpretation_id"] is None
        and r["source_condition_reference"] is None
    )


def check_receiving_movement_invariants(mov, label):
    """Verify exact movement valuation, condition, allocatability, and PO restriction rules."""
    expected_total = php_line_total(mov["quantity"], mov["unit_valuation_php"])
    if Decimal(mov["total_value_php"]) != expected_total:
        raise ValueError(f"{label}: movement total_value_php mismatch")
    if mov["source_kind"] == "po_rm" and not is_unrestricted(mov["restrictions"]):
        raise ValueError(f"{label}: po_rm movement must carry unrestricted BoundedRestriction")
    expected_alloc = mov["condition"] == "usable" and mov["restrictions"]["state"] != "uninterpreted"
    if mov["immediately_allocatable"] != expected_alloc:
        raise ValueError(f"{label}: movement immediately_allocatable mismatch")


def check_receiving_report_invariants(rm, label, check_value=None, case=None, posting=None):
    """Verify RCV-01..07 exact decimal conservation, PHP totals, restriction rules, and signed evidence hash."""
    zero = Decimal("0")
    total_php = Decimal("0.00")
    expected_purpose = "po_supplier_dr" if rm["source_kind"] == "po" else "da_receipt"
    discrepant_lines = 0
    for idx, line in enumerate(rm["lines"]):
        line_label = f"{label}.lines[{idx}]"
        delivered = Decimal(line["delivered_quantity"])
        accepted = Decimal(line["accepted_quantity"])
        damaged = Decimal(line["damaged_quantity"])
        rejected = Decimal(line["rejected_quantity"])
        if accepted + damaged + rejected != delivered:
            raise ValueError(f"{line_label}: delivered != accepted + damaged + rejected")
        expected_val = php_line_total(line["accepted_quantity"], line["unit_valuation_php"])
        if Decimal(line["accepted_value_php"]) != expected_val:
            raise ValueError(f"{line_label}: accepted_value_php mismatch")
        total_php += expected_val
        if damaged > zero or rejected > zero:
            discrepant_lines += 1
            if line["discrepancy_notes"] is None:
                raise ValueError(f"{line_label}: damaged/rejected quantity requires discrepancy_notes")
        if rm["source_kind"] == "po":
            if not is_unrestricted(line["restrictions"]):
                raise ValueError(f"{line_label}: PO-RM line must carry unrestricted BoundedRestriction")
        elif line["resolves_discrepancy_id"] is not None:
            raise ValueError(f"{line_label}: DA-RM line cannot reference resolves_discrepancy_id")
    if Decimal(rm["accepted_total_value_php"]) != total_php:
        raise ValueError(f"{label}: accepted_total_value_php does not equal sum of line accepted values")
    snap = rm["snapshot"]
    if snap is not None:
        if (
            snap["target"]["purpose"] != expected_purpose
            or snap["target"]["record_id"] != rm["id"]
            or snap["material_version"] != rm["material_version"]
        ):
            raise ValueError(f"{label}: snapshot target/purpose/version mismatch")
    ack = rm["evidence_acknowledgment"]
    if ack is not None:
        if snap is None or ack["snapshot"] != snap:
            raise ValueError(f"{label}: evidence_acknowledgment snapshot differs from RM snapshot")
    if case is not None:
        op = case["operationId"]
        req_body = case.get("request", {}).get("body", {})
        if op in {"inspectReceivingReport", "matchReceivingReportEvidence", "postReceivingReport"}:
            if "evidence_material" not in case:
                raise ValueError(f"{label}: {op} worked example must include evidence_material")
            mat = case["evidence_material"]
            check_value("#/components/schemas/ReceivingReportEvidenceMaterial", mat, label + " evidence_material")
            expected_mat = {
                "chapter_id": rm["chapter_id"],
                "rm_id": rm["id"],
                "material_version": rm["material_version"],
                "source_kind": rm["source_kind"],
                "source_id": rm["source_id"],
                "source_reference": rm["source_reference"],
                "source_material_version": rm["source_material_version"],
                "supplier_dr_reference": rm["supplier_dr_reference"],
                "supplier_dr_date": rm["supplier_dr_date"],
                "location_id": rm["location_id"],
                "accepted_total_value_php": rm["accepted_total_value_php"],
                "inspector_id": rm["inspection"]["inspector"]["user_id"],
                "technical_or_requesting_representative_id": (
                    rm["inspection"]["technical_or_requesting_representative"]["user_id"]
                    if rm["inspection"]["technical_or_requesting_representative"]
                    else None
                ),
                "inspected_at": rm["inspection"]["inspected_at"],
                "lines": rm["lines"],
            }
            if mat != expected_mat or snap is None or snap["sha256"] != canonical_sha256(mat):
                raise ValueError(f"{label}: RM snapshot sha256 or material projection mismatch")
        if op == "matchReceivingReportEvidence":
            if (
                ack is None
                or ack["bytes"] != req_body["evidence"]
                or ack["acknowledged_at"] != req_body["acknowledged_at"]
                or snap["sha256"] != req_body["snapshot_sha256"]
            ):
                raise ValueError(f"{label}: evidence_acknowledgment does not match request evidence/acknowledged_at")
        if op == "postReceivingReport":
            if posting is None or posting["stock_version"] != rm["posting_stock_version"]:
                raise ValueError(f"{label}: posting.stock_version does not match rm.posting_stock_version")
            if len(posting["created_discrepancy_ids"]) != discrepant_lines:
                raise ValueError(f"{label}: posting.created_discrepancy_ids count does not match discrepant lines")
            if ack["acknowledgment_id"] != req_body["acknowledgment_id"]:
                raise ValueError(f"{label}: postReceivingReport acknowledgment_id mismatch")


def check_receiving_discrepancy_invariants(disc, label, check_value=None, case=None):
    """Verify RCV-05..06 discrepancy arithmetic, lot linkage, and no auto-clearance on source close."""
    zero = Decimal("0")
    damaged = Decimal(disc["damaged_quantity"])
    rejected = Decimal(disc["rejected_quantity"])
    total = Decimal(disc["total_discrepant_quantity"])
    if damaged + rejected != total:
        raise ValueError(f"{label}: damaged + rejected != total_discrepant_quantity")
    if (damaged > zero) != (disc["quarantined_lot_id"] is not None):
        raise ValueError(f"{label}: quarantined_lot_id presence must match damaged_quantity > 0")
    if (rejected > zero) != (disc["rejected_lot_id"] is not None):
        raise ValueError(f"{label}: rejected_lot_id presence must match rejected_quantity > 0")
    if disc["quarantined_lots_auto_cleared_on_source_close"] is not False:
        raise ValueError(f"{label}: quarantined_lots_auto_cleared_on_source_close must be false")
    if disc["source_kind"] == "da" and disc["supplier_notification"] is not None:
        raise ValueError(f"{label}: DA discrepancy cannot have supplier_notification")
    res = disc["resolution"]
    if res is not None:
        po_kinds = {"supplier_replacement_received", "returned_to_supplier", "credit_or_short_closed"}
        da_kinds = {"donated_declined_or_disposed"}
        valid_kinds = po_kinds if disc["source_kind"] == "po" else da_kinds
        if res["resolution_kind"] not in valid_kinds:
            raise ValueError(f"{label}: resolution_kind incompatible with source_kind {disc['source_kind']}")
        ack = res["evidence_acknowledgment"]
        snap = ack["snapshot"]
        if snap["target"]["purpose"] != "receiving_discrepancy" or snap["target"]["record_id"] != disc["id"]:
            raise ValueError(f"{label}: resolution evidence target/purpose mismatch")
        if case is not None and case["operationId"] == "resolveReceivingDiscrepancy":
            req_body = case["request"]["body"]
            if req_body["action"] == "resolve":
                if "evidence_material" not in case:
                    raise ValueError(f"{label}: resolveReceivingDiscrepancy(resolve) must include evidence_material")
                mat = case["evidence_material"]
                check_value("#/components/schemas/ReceivingDiscrepancyEvidenceMaterial", mat, label + " evidence_material")
                expected_mat = {
                    "chapter_id": disc["chapter_id"],
                    "discrepancy_id": disc["id"],
                    "material_version": req_body["expected_material_version"],
                    "resolution_kind": res["resolution_kind"],
                    "reason": res["reason"],
                    "replacement_rm_id": res["replacement_rm_id"],
                    "quarantined_lot_disposition": res["quarantined_lot_disposition"],
                }
                if (
                    mat != expected_mat
                    or snap["sha256"] != canonical_sha256(mat)
                    or ack["bytes"] != req_body["evidence"]
                    or ack["acknowledged_at"] != req_body["signed_at"]
                ):
                    raise ValueError(f"{label}: discrepancy resolution evidence/material mismatch")


def check_receiving_hold_invariants(hold, label, check_value=None, case=None):
    """Verify RCV-01, RCV-10, S3-15 hold invariants: zero usable stock and no IPC creation."""
    if hold["usable_stock_posted"] is not False or hold["ipc_creation_prohibited"] is not True:
        raise ValueError(f"{label}: receiving hold violates zero-usable-stock or IPC prohibition")
    rej = hold["rejection_return"]
    if rej is not None:
        ack = rej["evidence_acknowledgment"]
        snap = ack["snapshot"]
        if snap["target"]["purpose"] != "missing_source_hold" or snap["target"]["record_id"] != hold["id"]:
            raise ValueError(f"{label}: hold rejection evidence target/purpose mismatch")
        if case is not None and case["operationId"] == "rejectReturnReceivingHold":
            if "evidence_material" not in case:
                raise ValueError(f"{label}: rejectReturnReceivingHold must include evidence_material")
            req_body = case["request"]["body"]
            mat = case["evidence_material"]
            check_value("#/components/schemas/ReceivingHoldRejectionEvidenceMaterial", mat, label + " evidence_material")
            expected_mat = {
                "chapter_id": hold["chapter_id"],
                "hold_id": hold["id"],
                "material_version": req_body["expected_material_version"],
                "reason": rej["reason"],
                "recipient_or_carrier_name": rej["recipient_or_carrier_name"],
            }
            if (
                mat != expected_mat
                or snap["sha256"] != canonical_sha256(mat)
                or ack["bytes"] != req_body["evidence"]
                or ack["acknowledged_at"] != req_body["signed_at"]
            ):
                raise ValueError(f"{label}: hold rejection evidence/material mismatch")


def check_prepare_receiving_invariants(inp, out, label):
    """Verify Efren prepareReceivingInventory exact lot conservation, allocatability, movements, and source updates."""
    zero = Decimal("0")
    total_accepted = zero
    total_damaged = zero
    total_rejected = zero
    expected_discrepant_lines = 0
    lines_by_source = {}
    for idx, ln in enumerate(inp["lines"]):
        d, a, dmg, rej = (
            Decimal(ln["delivered_quantity"]),
            Decimal(ln["accepted_quantity"]),
            Decimal(ln["damaged_quantity"]),
            Decimal(ln["rejected_quantity"]),
        )
        if a + dmg + rej != d:
            raise ValueError(f"{label}.input.lines[{idx}]: delivered != accepted + damaged + rejected")
        if inp["source_kind"] == "po_rm" and not is_unrestricted(ln["restrictions"]):
            raise ValueError(f"{label}.input.lines[{idx}]: po_rm line must be unrestricted")
        if inp["source_kind"] == "da_rm" and ln["resolves_discrepancy_id"] is not None:
            raise ValueError(f"{label}.input.lines[{idx}]: da_rm line cannot set resolves_discrepancy_id")
        total_accepted += a
        total_damaged += dmg
        total_rejected += rej
        if dmg > zero or rej > zero:
            expected_discrepant_lines += 1
        lines_by_source[ln["source_line_id"]] = (a, dmg + rej)
    if out["outcome"] != "ready":
        return
    if out["stock_version"] <= inp["current_stock_version"]:
        raise ValueError(f"{label}: output stock_version must exceed current_stock_version")
    usable_sum = sum((Decimal(lot["quantity"]) for lot in out["usable_lots"]), zero)
    quar_only_sum = sum((Decimal(lot["quantity"]) for lot in out["quarantined_or_rejected_lots"] if lot["condition"] == "quarantined"), zero)
    rej_only_sum = sum((Decimal(lot["quantity"]) for lot in out["quarantined_or_rejected_lots"] if lot["condition"] == "rejected"), zero)
    if usable_sum != total_accepted:
        raise ValueError(f"{label}: usable_lots quantity sum does not equal accepted total")
    if quar_only_sum != total_damaged:
        raise ValueError(f"{label}: quarantined lots sum does not equal damaged total")
    if rej_only_sum != total_rejected:
        raise ValueError(f"{label}: rejected lots sum does not equal rejected total")
    for lot in out["usable_lots"]:
        if lot["condition"] != "usable" or lot["source_kind"] != inp["source_kind"]:
            raise ValueError(f"{label}: usable lot condition/source_kind mismatch")
        expected_alloc = lot["restrictions"]["state"] != "uninterpreted"
        if lot["immediately_allocatable"] != expected_alloc:
            raise ValueError(f"{label}: usable lot immediately_allocatable violates ADR 0004 / RCV-04")
    quar_lot_ids = set()
    rej_lot_ids = set()
    for lot in out["quarantined_or_rejected_lots"]:
        if lot["condition"] == "quarantined":
            quar_lot_ids.add(lot["lot_id"])
        elif lot["condition"] == "rejected":
            rej_lot_ids.add(lot["lot_id"])
        else:
            raise ValueError(f"{label}: unexpected condition in quarantined_or_rejected_lots")
        if lot["immediately_allocatable"] is not False:
            raise ValueError(f"{label}: quarantined/rejected lot must be non-allocatable")
    for idx, mov in enumerate(out["movements"]):
        check_receiving_movement_invariants(mov, f"{label}.movements[{idx}]")
    if len(out["created_discrepancies"]) != expected_discrepant_lines:
        raise ValueError(f"{label}: created_discrepancies count mismatch")
    for idx, seed in enumerate(out["created_discrepancies"]):
        dmg, rej, tot = Decimal(seed["damaged_quantity"]), Decimal(seed["rejected_quantity"]), Decimal(seed["total_discrepant_quantity"])
        if dmg + rej != tot:
            raise ValueError(f"{label}.created_discrepancies[{idx}]: damaged + rejected != total")
        if (dmg > zero) != (seed["quarantined_lot_id"] is not None) or (seed["quarantined_lot_id"] and seed["quarantined_lot_id"] not in quar_lot_ids):
            raise ValueError(f"{label}.created_discrepancies[{idx}]: quarantined_lot_id mismatch")
        if (rej > zero) != (seed["rejected_lot_id"] is not None) or (seed["rejected_lot_id"] and seed["rejected_lot_id"] not in rej_lot_ids):
            raise ValueError(f"{label}.created_discrepancies[{idx}]: rejected_lot_id mismatch")
    valid_statuses = {"issued", "partially_received", "receiving_complete"} if inp["source_kind"] == "po_rm" else {"acknowledged", "partially_received", "received"}
    for idx, upd in enumerate(out["source_line_updates"]):
        if upd["new_source_status"] not in valid_statuses:
            raise ValueError(f"{label}.source_line_updates[{idx}]: new_source_status incompatible with {inp['source_kind']}")
        exp_a, exp_disc = lines_by_source.get(upd["source_line_id"], (None, None))
        if exp_a is None or Decimal(upd["accepted_delta"]) != exp_a or Decimal(upd["rejected_or_disputed_delta"]) != exp_disc:
            raise ValueError(f"{label}.source_line_updates[{idx}]: delta mismatch against input lines")


ALLOCATION_TIER_ORDER = {
    "active_commitment": 0,
    "approved_override": 1,
    "standard_priority": 2,
}


def check_allocation_queue_invariants(body, label):
    if body["is_commit_authorization"] is not False:
        raise ValueError(f"{label}: is_commit_authorization must be false")
    prev_key = None
    for idx, row in enumerate(body["data"]):
        if row["queue_position"] != idx + 1:
            raise ValueError(f"{label}[{idx}]: queue_position must be contiguous starting at 1")
        approved = Decimal(row["approved_quantity"])
        issued = Decimal(row["issued_quantity"])
        canceled = Decimal(row["canceled_quantity"])
        reserved = Decimal(row["active_reserved_quantity"])
        unreserved = Decimal(row["unreserved_outstanding_quantity"])
        if approved - issued - canceled - reserved != unreserved or unreserved <= 0:
            raise ValueError(f"{label}[{idx}]: unreserved_outstanding_quantity mismatch")
        if row["allocation_tier"] == "active_commitment" and reserved <= 0:
            raise ValueError(f"{label}[{idx}]: active_commitment requires active_reserved_quantity > 0")
        usable = Decimal(row["usable_stockroom_on_hand"])
        held = Decimal(row["active_stock_hold_quantity"])
        ineligible = Decimal(row["ineligible_restricted_quantity"])
        uninterpreted = Decimal(row["uninterpreted_restricted_quantity"])
        eligible = Decimal(row["eligible_available_quantity"])
        if uninterpreted > ineligible:
            raise ValueError(f"{label}[{idx}]: uninterpreted_restricted_quantity exceeds ineligible_restricted_quantity")
        if eligible > usable - held - ineligible:
            raise ValueError(f"{label}[{idx}]: eligible_available_quantity exceeds usable - held - ineligible")
        source_sum = sum((Decimal(s["free_quantity"]) for s in row["eligible_sources"]), Decimal("0"))
        if source_sum != eligible:
            raise ValueError(f"{label}[{idx}]: sum(eligible_sources.free_quantity) != eligible_available_quantity")
        routes = row["stage1_next_routes"]
        if row["rf_id"] not in routes["allocation_review_route"] or row["rf_line_id"] not in routes["allocation_review_route"]:
            raise ValueError(f"{label}[{idx}]: allocation_review_route does not match rf_id/rf_line_id")
        if row["rf_id"] not in routes["reservation_prepare_route"] or row["rf_id"] not in routes["actual_issue_prepare_route"]:
            raise ValueError(f"{label}[{idx}]: stage1_next_routes do not match rf_id")
        order_key = (
            ALLOCATION_TIER_ORDER[row["allocation_tier"]],
            row["priority_rank"],
            row["needed_at"],
            row["approved_at"],
            row["rf_line_id"],
        )
        if prev_key is not None and order_key <= prev_key:
            raise ValueError(f"{label}[{idx}]: INV-09 ordering violated")
        prev_key = order_key


def check_officer_alerts_invariants(body, label, alerts_read_duties):
    if body["persisted_ack_supported"] is not False:
        raise ValueError(f"{label}: persisted_ack_supported must be false")
    allowed_duties = set(body["caller_matched_duties"])
    if not allowed_duties <= set(alerts_read_duties):
        raise ValueError(f"{label}: caller_matched_duties contains duty outside alerts.read")
    seen_keys = set()
    for idx, alert in enumerate(body["data"]):
        if alert["responsible_duty"] not in allowed_duties:
            raise ValueError(f"{label}[{idx}]: alert responsible_duty outside caller_matched_duties")
        expected_key = f"{alert['alert_type']}:{alert['record_kind']}:{alert['record_id']}"
        if alert["alert_key"] != expected_key:
            raise ValueError(f"{label}[{idx}]: alert_key must equal alert_type:record_kind:record_id")
        if expected_key in seen_keys:
            raise ValueError(f"{label}[{idx}]: duplicate alert_key in live feed")
        seen_keys.add(expected_key)


def check_report_date_range(metadata, label):
    f = metadata["filters"]
    start = date.fromisoformat(f["date_from"])
    end = date.fromisoformat(f["date_to"])
    if start > end:
        raise ValueError(f"{label}: report date_from must be <= date_to")
    if (end - start).days > 366:
        raise ValueError(f"{label}: report date span exceeds 366 days")


def check_inventory_report_invariants(body, label):
    check_report_date_range(body["metadata"], label)
    if body["stock_category_labels"]["views_are_additive"] is not False:
        raise ValueError(f"{label}: stock categories must remain non-additive")
    rows = body["data"]
    total_val = Decimal("0.00")
    low_count = 0
    uninterp_count = 0
    shortage_count = 0
    for idx, row in enumerate(rows):
        usable = Decimal(row["usable_stockroom_on_hand"])
        avail = Decimal(row["available_to_allocate"])
        if avail > usable:
            raise ValueError(f"{label}[{idx}]: available_to_allocate exceeds usable_stockroom_on_hand")
        if row["restriction_state"] == "uninterpreted" and avail != 0:
            raise ValueError(f"{label}[{idx}]: uninterpreted row must have available_to_allocate == 0")
        if row["condition"] in {"quarantined", "rejected"} and (usable != 0 or avail != 0):
            raise ValueError(f"{label}[{idx}]: quarantined/rejected row must have 0 usable and available stock")
        total_val += Decimal(row["usable_valuation_php"])
        if row["low_stock_breach"]:
            low_count += 1
        if row["restriction_state"] == "uninterpreted":
            uninterp_count += 1
        if Decimal(row["unreserved_rf_shortage"]) > 0:
            shortage_count += 1
    totals = body["totals"]
    if (
        totals["row_count"] != len(rows)
        or Decimal(totals["total_usable_valuation_php"]) != total_val
        or totals["low_stock_row_count"] != low_count
        or totals["uninterpreted_row_count"] != uninterp_count
        or totals["shortage_row_count"] != shortage_count
    ):
        raise ValueError(f"{label}: inventory report totals mismatch")


def check_procurement_report_invariants(body, label):
    check_report_date_range(body["metadata"], label)
    open_rf_lines = 0
    for idx, rf in enumerate(body["rf_demand_summary"]):
        approved = Decimal(rf["approved_quantity"])
        issued = Decimal(rf["issued_quantity"])
        outstanding = Decimal(rf["outstanding_quantity"])
        canceled = Decimal(rf["canceled_quantity"])
        reserved = Decimal(rf["active_reserved_quantity"])
        if issued + outstanding + canceled != approved:
            raise ValueError(f"{label}.rf[{idx}]: issued + outstanding + canceled != approved")
        if reserved > outstanding:
            raise ValueError(f"{label}.rf[{idx}]: active_reserved exceeds outstanding")
        if outstanding > 0:
            open_rf_lines += 1
    total_ordered = Decimal("0.00")
    total_accepted = Decimal("0.00")
    open_disc = 0
    for idx, po in enumerate(body["purchase_order_summary"]):
        ordered = Decimal(po["ordered_quantity"])
        accepted = Decimal(po["accepted_quantity"])
        outstanding = Decimal(po["outstanding_quantity"])
        if accepted > ordered:
            raise ValueError(f"{label}.po[{idx}]: accepted_quantity exceeds ordered_quantity")
        if po["status"] in {"issued", "partially_received", "receiving_complete"} and ordered - accepted != outstanding:
            raise ValueError(f"{label}.po[{idx}]: outstanding_quantity != ordered - accepted")
        total_ordered += Decimal(po["ordered_total_php"])
        total_accepted += Decimal(po["accepted_value_php"])
        open_disc += po["open_discrepancy_count"]
    distinct_po_ids = {po["po_id"] for po in body["purchase_order_summary"]}
    totals = body["totals"]
    if (
        totals["open_rf_lines_count"] != open_rf_lines
        or totals["repf_count"] != len(body["repf_summary"])
        or totals["po_count"] != len(distinct_po_ids)
        or Decimal(totals["total_ordered_php"]) != total_ordered
        or Decimal(totals["total_accepted_value_php"]) != total_accepted
        or totals["open_discrepancy_count"] != open_disc
    ):
        raise ValueError(f"{label}: procurement report totals mismatch")


def check_control_report_invariants(body, label):
    check_report_date_range(body["metadata"], label)
    total_decl = Decimal("0.00")
    uninterp = 0
    for idx, row in enumerate(body["donation_restrictions"]):
        if Decimal(row["received_quantity"]) > Decimal(row["declared_quantity"]):
            raise ValueError(f"{label}.donation[{idx}]: received_quantity exceeds declared_quantity")
        if row["restriction"]["state"] == "uninterpreted":
            uninterp += 1
            if row["allocatable_now"] is not False:
                raise ValueError(f"{label}.donation[{idx}]: uninterpreted donation must have allocatable_now: false")
        total_decl += Decimal(row["declared_value_php"])
    totals = body["totals"]
    if (
        totals["donation_row_count"] != len(body["donation_restrictions"])
        or totals["uninterpreted_donation_count"] != uninterp
        or totals["resolution_count"] != len(body["restriction_resolutions"])
        or totals["overdue_exception_count"] != len(body["overdue_exceptions"])
        or totals["audit_entry_count"] != len(body["audit_history"])
        or Decimal(totals["total_declared_donation_value_php"]) != total_decl
    ):
        raise ValueError(f"{label}: control report totals mismatch")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--invalid-example", action="store_true")
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    contract_path = root / "openapi.yaml"
    document = read_yaml(contract_path)
    examples = read_yaml(root / "examples.yaml")
    uri = contract_path.as_uri()

    def at(pointer):
        node = document
        for part in pointer.removeprefix("#/").split("/"):
            key = part.replace("~1", "/").replace("~0", "~")
            node = node[int(key)] if isinstance(node, list) else node[key]
        return node

    def dereference(pointer):
        node = at(pointer)
        seen = set()
        while isinstance(node, dict) and "$ref" in node:
            if pointer in seen:
                raise ValueError(f"Reference cycle outside a schema: {pointer}")
            seen.add(pointer)
            pointer = node["$ref"]
            node = at(pointer)
        return pointer, node

    def check_references(node):
        if isinstance(node, dict):
            if "$ref" in node:
                reference = node["$ref"]
                if not reference.startswith("#/"):
                    raise ValueError(f"Only local contract references are supported: {reference}")
                at(reference)
            for value in node.values():
                check_references(value)
        elif isinstance(node, list):
            for value in node:
                check_references(value)

    def check_closed_objects(node, location="#/components/schemas"):
        if isinstance(node, dict):
            if node.get("type") == "object" and node.get("additionalProperties") is not False:
                raise ValueError(f"Open object schema missing additionalProperties: false at {location}")
            for key, value in node.items():
                check_closed_objects(value, f"{location}/{pointer_part(key)}")
        elif isinstance(node, list):
            for idx, value in enumerate(node):
                check_closed_objects(value, f"{location}/{idx}")

    check_references(document)
    check_closed_objects(document["components"]["schemas"])
    validate(document, base_uri=uri, cls=OpenAPIV31SpecValidator)
    registry = Registry().with_resource(
        uri, Resource.from_contents(document, default_specification=DRAFT202012)
    )
    checked = 0

    def check_value(pointer, value, label, expected_valid=True):
        nonlocal checked
        validator = Draft202012Validator(
            {"$ref": uri + pointer}, registry=registry, format_checker=FormatChecker()
        )
        errors = list(validator.iter_errors(value))
        if bool(errors) == expected_valid:
            detail = "expected schema rejection"
            if errors:
                error = errors[0]
                location = "/" + "/".join(map(str, error.absolute_path))
                detail = f"{location} violates {error.validator}"
            raise ValueError(f"{label}: {detail}")
        checked += 1

    def check_inline_examples(pointer):
        _, node = dereference(pointer)
        if "schema" not in node:
            return
        if "example" in node:
            check_value(pointer + "/schema", node["example"], pointer + " example")
        for name in node.get("examples", {}):
            _, example = dereference(pointer + "/examples/" + pointer_part(name))
            if "value" not in example:
                raise ValueError(f"Example {name} must have a local value")
            check_value(pointer + "/schema", example["value"], pointer + " " + name)

    # Validate reusable parameter and header inline examples as well as operation-bound ones
    for param_name in document.get("components", {}).get("parameters", {}):
        check_inline_examples("#/components/parameters/" + pointer_part(param_name))
    for header_name in document.get("components", {}).get("headers", {}):
        check_inline_examples("#/components/headers/" + pointer_part(header_name))

    # Verify exact Stage 1 + Stage 2 additive EvidencePurpose enum coverage
    purposes = set(document["components"]["schemas"]["EvidencePurpose"]["enum"])
    if purposes != (STAGE1_EVIDENCE_PURPOSES | STAGE2_EVIDENCE_PURPOSES):
        raise ValueError("EvidencePurpose must equal Stage 1 plus additive Stage 2 values")

    # Verify action duties use canonical 14-duty vocabulary and include all required Stage 2 actions
    valid_duties = set(document["components"]["schemas"]["Duty"]["enum"])
    action_duties = document.get("x-stage2-action-duties", {})
    missing_actions = REQUIRED_STAGE2_ACTIONS - action_duties.keys()
    if missing_actions:
        raise ValueError(f"Missing required x-stage2-action-duties entries: {sorted(missing_actions)}")
    for action, duties in action_duties.items():
        if not duties or not set(duties) <= valid_duties:
            raise ValueError(f"Action {action} references invalid or empty duties")

    operations = {}
    unsafe_operations = set()
    for path, path_item in document["paths"].items():
        lowered = path.lower()
        for fragment in FORBIDDEN_PUBLIC_PATH_FRAGMENTS:
            if fragment in lowered:
                raise ValueError(f"Forbidden public policy/participant path: {path}")
        for method, operation in path_item.items():
            if method not in {"get", "post", "put", "patch", "delete", "options", "head", "trace"}:
                continue
            if "/alerts" in lowered and method != "get":
                raise ValueError(f"Derived officer alerts must not expose write route: {method.upper()} {path}")
            operation_id = operation["operationId"]
            if operation_id in operations:
                raise ValueError(f"Duplicate operation ID: {operation_id}")
            required_action = operation.get("x-required-action")
            if required_action and required_action not in action_duties:
                raise ValueError(f"Operation {operation_id} action missing from x-stage2-action-duties")
            pointer = f"#/paths/{pointer_part(path)}/{method}"
            operations[operation_id] = (pointer, operation)
            for index, _ in enumerate(operation.get("parameters", [])):
                parameter_pointer, _ = dereference(pointer + f"/parameters/{index}")
                check_inline_examples(parameter_pointer)
            if "requestBody" in operation:
                body_pointer, body = dereference(pointer + "/requestBody")
                for media in body["content"]:
                    check_inline_examples(body_pointer + "/content/" + pointer_part(media))
            for status in operation["responses"]:
                response_pointer, response = dereference(pointer + "/responses/" + status)
                if "Cache-Control" not in response.get("headers", {}):
                    raise ValueError(f"Operation {operation_id} status {status} missing Cache-Control header")
                for media in response.get("content", {}):
                    check_inline_examples(response_pointer + "/content/" + pointer_part(media))
                for header in response.get("headers", {}):
                    header_pointer, _ = dereference(response_pointer + "/headers/" + pointer_part(header))
                    check_inline_examples(header_pointer)
            if method in {"post", "put", "patch", "delete"}:
                unsafe_operations.add(operation_id)
                required_headers = {
                    param["name"]
                    for idx in range(len(operation.get("parameters", [])))
                    for param in [dereference(pointer + f"/parameters/{idx}")[1]]
                    if param.get("in") == "header" and param.get("required") is True
                }
                if not {"Origin", "X-Action-Key"} <= required_headers:
                    raise ValueError(f"Unsafe operation {operation_id} must require Origin and X-Action-Key headers")
                sec_list = operation.get("security", [])
                if not sec_list or not all("browserSession" in sec and "csrfProof" in sec for sec in sec_list):
                    raise ValueError(f"Unsafe operation {operation_id} must require browserSession and csrfProof on every security branch")
                for status in operation["responses"]:
                    if status.startswith("2"):
                        _, resp = dereference(pointer + "/responses/" + status)
                        if "X-Action-Replayed" not in resp.get("headers", {}):
                            raise ValueError(f"Unsafe operation {operation_id} {status} missing X-Action-Replayed")

    # Verify ProcurementOperationName and ReceivingOperationName enum values resolve to actual public unsafe operations
    proc_ops = set(document["components"]["schemas"]["ProcurementOperationName"]["enum"])
    unknown_proc_ops = proc_ops - unsafe_operations
    if unknown_proc_ops:
        raise ValueError(f"ProcurementOperationName references non-unsafe or unknown operations: {sorted(unknown_proc_ops)}")
    rcv_ops = set(document["components"]["schemas"]["ReceivingOperationName"]["enum"])
    unknown_rcv_ops = rcv_ops - unsafe_operations
    if unknown_rcv_ops:
        raise ValueError(f"ReceivingOperationName references non-unsafe or unknown operations: {sorted(unknown_rcv_ops)}")

    # Verify Stage 1 repeated RF fulfillment compatibility and explicit Stage 2 report deferrals (RPT-05, RPT-07)
    compat = document.get("x-stage1-compatibility", {})
    if "repeatedRfFulfillmentUnchanged" not in compat:
        raise ValueError("Missing x-stage1-compatibility.repeatedRfFulfillmentUnchanged documentation")
    deferred = document.get("x-stage2-deferred-reporting", {})
    if (
        deferred.get("finance_and_booth_reports", {}).get("requirement") != "RPT-05"
        or deferred.get("binary_pdf_csv_exports", {}).get("requirement") != "RPT-07"
    ):
        raise ValueError("Missing explicit deferral documentation for RPT-05 and RPT-07 under x-stage2-deferred-reporting")

    # Verify JSON and /print Stage 2 report pairs enforce identical duty scoping, filter params, and print headers
    required_report_filters = {"chapter_id", "date_from", "date_to", "item_id", "variant_id", "location_id", "status"}
    for json_op, print_op in (
        ("readInventoryReport", "printInventoryReport"),
        ("readProcurementReport", "printProcurementReport"),
        ("readControlReport", "printControlReport"),
    ):
        j_ptr, j_def = operations[json_op]
        p_ptr, p_def = operations[print_op]
        if j_def.get("x-required-action") != p_def.get("x-required-action"):
            raise ValueError(f"Report pair {json_op}/{print_op} must enforce identical x-required-action")
        j_params = {
            dereference(j_ptr + f"/parameters/{i}")[1]["name"]: dereference(j_ptr + f"/parameters/{i}")[1]
            for i in range(len(j_def.get("parameters", [])))
        }
        p_params = {
            dereference(p_ptr + f"/parameters/{i}")[1]["name"]: dereference(p_ptr + f"/parameters/{i}")[1]
            for i in range(len(p_def.get("parameters", [])))
        }
        if not required_report_filters <= j_params.keys() or not required_report_filters <= p_params.keys():
            raise ValueError(f"Report pair {json_op}/{print_op} missing explicit required filters")
        for req_date in ("date_from", "date_to"):
            if j_params[req_date].get("required") is not True or p_params[req_date].get("required") is not True:
                raise ValueError(f"Report pair {json_op}/{print_op} must require explicit {req_date}")
        _, p_ok = dereference(p_ptr + "/responses/200")
        if not {"Cache-Control", "Content-Security-Policy", "X-Content-Type-Options"} <= set(p_ok.get("headers", {})):
            raise ValueError(f"Printable report {print_op} 200 response missing required security/cache headers")

    donation_transitions = document.get("x-stage2-donation-transitions", {})
    po_transitions = document.get("x-stage2-po-transitions", {})
    receiving_transitions = document.get("x-stage2-receiving-transitions", {})
    discrepancy_transitions = document.get("x-stage2-discrepancy-transitions", {})
    hold_transitions = document.get("x-stage2-hold-transitions", {})
    covered = set()
    names = set()
    for case in examples["cases"]:
        name = case["name"]
        if name in names:
            raise ValueError(f"Duplicate consumer case: {name}")
        names.add(name)
        pointer, operation = operations[case["operationId"]]
        request = case.get("request", {})
        if "requestBody" in operation:
            body_pointer, _ = dereference(pointer + "/requestBody")
            request_media = request.get("media_type", "application/json")
            request_schema = body_pointer + "/content/" + pointer_part(request_media) + "/schema"
            check_value(request_schema, request["body"], name + " request", case.get("request_valid", True))
        elif "body" in request:
            raise ValueError(f"{name}: operation has no request body")
        request_headers = examples["request_defaults"]["headers"] | request.get("headers", {})
        if pointer.endswith("/get"):
            if "X-Action-Key" in request.get("headers", {}):
                raise ValueError(f"{name}: GET must not send X-Action-Key")
            for header in ("X-Action-Key", "X-XSRF-TOKEN", "Origin", "Content-Type"):
                request_headers.pop(header, None)
        request_locations = {
            "header": request_headers,
            "path": request.get("path", {}),
            "query": request.get("query", {}),
        }
        for index, _ in enumerate(operation.get("parameters", [])):
            parameter_pointer, parameter = dereference(pointer + f"/parameters/{index}")
            values = request_locations[parameter["in"]]
            if parameter["name"] not in values:
                if parameter.get("required", False):
                    raise ValueError(f"{name}: missing {parameter['in']} parameter {parameter['name']}")
                continue
            check_value(
                parameter_pointer + "/schema",
                values[parameter["name"]],
                name + " " + parameter["in"],
                parameter["in"] + "." + parameter["name"] not in case.get("invalid_parameters", []),
            )
        response = case["response"]
        status = response["status"]
        response_pointer, definition = dereference(pointer + "/responses/" + status)
        if status.startswith("2"):
            covered.add(case["operationId"])
        if "content" in definition:
            response_media = response.get("media_type", "application/json")
            check_value(
                response_pointer + "/content/" + pointer_part(response_media) + "/schema",
                response["body"],
                name + " response",
            )
            if case["operationId"] == "listReplenishmentNeeds" and status == "200":
                for idx, item in enumerate(response["body"]["data"]):
                    check_replenishment_math(item, f"{name}[{idx}]")
            if status in {"200", "201"} and response_media == "application/json":
                body_data = response["body"].get("data")
                if case["operationId"] in {"readRepf", "readRepfVersion"}:
                    check_repf_invariants(body_data, name)
                elif case["operationId"] == "listRepfs":
                    for idx, repf in enumerate(body_data):
                        check_repf_invariants(repf, f"{name}[{idx}]")
                elif case["operationId"] in {"readPurchaseOrder", "readPurchaseOrderVersion"}:
                    check_po_invariants(body_data, name)
                elif case["operationId"] == "listPurchaseOrders":
                    for idx, po in enumerate(body_data):
                        check_po_invariants(po, f"{name}[{idx}]")
                elif case["operationId"] == "listRepfQuotations":
                    for idx, quote in enumerate(body_data):
                        check_quotation_invariants(quote, f"{name}[{idx}]")
                elif case["operationId"] in proc_ops | {"findProcurementOperationByKey", "readProcurementOperation"}:
                    if isinstance(body_data, dict):
                        rk = body_data.get("resource_kind")
                        if rk == "repf":
                            check_repf_invariants(body_data["result"], name)
                        elif rk == "quotation":
                            check_quotation_invariants(body_data["result"], name)
                        elif rk == "supplier_selection":
                            check_supplier_selection_invariants(body_data["result"], name)
                        elif rk == "purchase_order":
                            check_po_invariants(body_data["result"], name)
                        elif rk == "purchase_order_amendment":
                            po_obj = body_data["result"]["purchase_order"]
                            check_po_invariants(po_obj, name)
                            check_po_amendment_invariants(body_data["result"]["amendment"], po_obj, name)
                elif case["operationId"] in {"readReceivingReport", "readReceivingReportVersion"}:
                    check_receiving_report_invariants(body_data, name, check_value, case)
                elif case["operationId"] == "listReceivingReports":
                    for idx, rm in enumerate(body_data):
                        check_receiving_report_invariants(rm, f"{name}[{idx}]")
                elif case["operationId"] == "listReceivingReportMovements":
                    for idx, mov in enumerate(body_data):
                        check_receiving_movement_invariants(mov, f"{name}[{idx}]")
                elif case["operationId"] == "readReceivingDiscrepancy":
                    check_receiving_discrepancy_invariants(body_data, name, check_value, case)
                elif case["operationId"] in {"listReceivingDiscrepancies", "listReceivingReportDiscrepancies"}:
                    for idx, disc in enumerate(body_data):
                        check_receiving_discrepancy_invariants(disc, f"{name}[{idx}]")
                elif case["operationId"] == "readReceivingHold":
                    check_receiving_hold_invariants(body_data, name, check_value, case)
                elif case["operationId"] == "listReceivingHolds":
                    for idx, hold in enumerate(body_data):
                        check_receiving_hold_invariants(hold, f"{name}[{idx}]")
                elif case["operationId"] in rcv_ops | {"findReceivingOperationByKey", "readReceivingOperation"}:
                    if isinstance(body_data, dict):
                        rk = body_data.get("resource_kind")
                        if rk == "receiving_report":
                            check_receiving_report_invariants(body_data["result"], name, check_value, case, body_data.get("posting"))
                        elif rk == "receiving_discrepancy":
                            check_receiving_discrepancy_invariants(body_data["result"], name, check_value, case)
                        elif rk == "receiving_hold":
                            check_receiving_hold_invariants(body_data["result"], name, check_value, case)
                elif case["operationId"] == "listAllocationQueue":
                    check_allocation_queue_invariants(response["body"], name)
                elif case["operationId"] == "listOfficerAlerts":
                    check_officer_alerts_invariants(response["body"], name, action_duties["alerts.read"])
                elif case["operationId"] == "readInventoryReport":
                    check_inventory_report_invariants(response["body"], name)
                elif case["operationId"] == "readProcurementReport":
                    check_procurement_report_invariants(response["body"], name)
                elif case["operationId"] == "readControlReport":
                    check_control_report_invariants(response["body"], name)
        elif "body" in response:
            raise ValueError(f"{name}: bodyless status contains a body")

        operation_id = case["operationId"]
        for tmap, label_kind in (
            (receiving_transitions, "receiving"),
            (discrepancy_transitions, "discrepancy"),
            (hold_transitions, "hold"),
        ):
            if operation_id in tmap and status.startswith("2"):
                receipt = response["body"]["data"]
                allowed = tmap[operation_id].get(case["before_status"], [])
                if receipt["operation_name"] != operation_id or receipt["status_code"] != int(status):
                    raise ValueError(f"{name}: {label_kind} receipt has the wrong operation or status")
                if receipt["result"]["status"] not in allowed:
                    raise ValueError(f"{name}: invalid {label_kind} state transition")
            if operation_id in tmap and status == "409" and "before_status" in case:
                if (
                    response["body"]["error"]["code"] != "invalid_transition"
                    or case["before_status"] in tmap[operation_id]
                ):
                    raise ValueError(f"{name}: fixture does not show a disallowed {label_kind} transition")
        if operation_id in po_transitions and status.startswith("2"):
            receipt = response["body"]["data"]
            if operation_id == "postReceivingReport":
                if receipt["result"]["source_kind"] == "po":
                    allowed = po_transitions[operation_id].get(case["source_before_status"], [])
                    if receipt["posting"]["source_status_after"] not in allowed:
                        raise ValueError(f"{name}: invalid PO state transition on postReceivingReport")
            else:
                po_obj = (
                    receipt["result"]["purchase_order"]
                    if receipt["resource_kind"] == "purchase_order_amendment"
                    else receipt["result"]
                )
                allowed = po_transitions[operation_id].get(case["before_status"], [])
                if receipt["operation_name"] != operation_id or receipt["status_code"] != int(status):
                    raise ValueError(f"{name}: PO receipt has the wrong operation or status")
                if po_obj["status"] not in allowed:
                    raise ValueError(f"{name}: invalid PO state transition")
        if operation_id in po_transitions and operation_id != "postReceivingReport" and status == "409" and "before_status" in case:
            if (
                response["body"]["error"]["code"] != "invalid_transition"
                or case["before_status"] in po_transitions[operation_id]
            ):
                raise ValueError(f"{name}: fixture does not show a disallowed PO transition")
        if operation_id in donation_transitions and status.startswith("2"):
            receipt = response["body"]["data"]
            if operation_id == "postReceivingReport":
                if receipt["result"]["source_kind"] == "da":
                    allowed = donation_transitions[operation_id].get(case["source_before_status"], [])
                    if receipt["posting"]["source_status_after"] not in allowed:
                        raise ValueError(f"{name}: invalid DA state transition on postReceivingReport")
            else:
                allowed = donation_transitions[operation_id].get(case["before_status"], [])
                if receipt["operation_name"] != operation_id or receipt["http_status"] != int(status):
                    raise ValueError(f"{name}: donation receipt has the wrong operation or status")
                if receipt["result"]["status"] not in allowed:
                    raise ValueError(f"{name}: invalid donation state transition")
                if operation_id in {"acknowledgeDonation", "resolveDonationRestriction"}:
                    check_donation_evidence(check_value, case, receipt)
        if operation_id in donation_transitions and operation_id != "postReceivingReport" and status == "409" and "before_status" in case:
            if (
                response["body"]["error"]["code"] != "invalid_transition"
                or case["before_status"] in donation_transitions[operation_id]
            ):
                raise ValueError(f"{name}: fixture does not show a disallowed donation transition")

        response_headers = {
            name: value
            for name, value in examples["response_defaults"]["headers"].items()
            if name in definition.get("headers", {})
        } | response.get("headers", {})
        for header_name in definition.get("headers", {}):
            header_pointer, header = dereference(response_pointer + "/headers/" + pointer_part(header_name))
            if header_name not in response_headers:
                if header.get("required", False):
                    raise ValueError(f"{name}: missing response header {header_name}")
                continue
            values = response_headers[header_name]
            if not isinstance(values, list):
                values = [values]
            for value in values:
                check_value(header_pointer + "/schema", value, name + " response header")
        if status == "422" and "requestBody" in operation:
            _, schema = dereference(request_schema)
            allowed_props = set(schema.get("properties", {}))
            for branch_key in ("oneOf", "anyOf", "allOf"):
                for branch in schema.get(branch_key, []):
                    resolved = dereference(branch["$ref"])[1] if "$ref" in branch else branch
                    allowed_props.update(resolved.get("properties", {}))
            for field in response["body"]["error"]["fields"]:
                field_pointer = field["pointer"]
                if field_pointer and field["code"] != "unexpected_field":
                    key = field_pointer.split("/")[1].replace("~1", "/").replace("~0", "~")
                    if key not in allowed_props:
                        raise ValueError(f"{name}: feedback points outside operation body")

    if covered != operations.keys():
        raise ValueError(f"Missing worked success: {sorted(operations.keys() - covered)}")

    # Validate controlled CLI-only Stage 2 policy procedures
    procedures = document.get("x-controlled-procedures", {})
    stage2_policies = document.get("x-stage2-policy-values", {})
    policy_lookup = {
        (entry.get("setting_key", key), entry["schema"]["$ref"]): (key, entry)
        for key, entry in stage2_policies.items()
    }
    procedure_coverage = set()
    stage2_policy_coverage = set()
    for case in examples.get("procedure_cases", []):
        name = case["name"]
        if name in names:
            raise ValueError(f"Duplicate consumer case: {name}")
        names.add(name)
        procedure_id = case["procedureId"]
        procedure = procedures[procedure_id]
        check_value(procedure["input"]["$ref"], case["input"], name + " input", case.get("input_valid", True))
        if procedure_id == "recordPolicy" and case.get("input_valid", True):
            policy = case["input"]["input"]
            match = policy_lookup.get((policy["setting_key"], policy["value_schema_reference"]))
            if not match:
                raise ValueError(f"{name}: unrecognized Stage 2 policy setting/schema")
            policy_name, policy_def = match
            chapter_policy = policy_def["subject_scope"] == "chapter"
            if (policy["subject_id"] is None) != chapter_policy or policy["ownership"] != policy_def["ownership"]:
                raise ValueError(f"{name}: policy subject/ownership mismatch")
            decoded = json.loads(policy["value"])
            if json.dumps(decoded, sort_keys=True, separators=(",", ":")) != policy["value"]:
                raise ValueError(f"{name}: policy value is not canonical compact JSON")
            check_value(
                policy_def["schema"]["$ref"],
                decoded,
                name + " decoded policy value",
                case.get("policy_value_valid", True),
            )
            if case["output"]["outcome"] == "committed" and case.get("policy_value_valid", True):
                stage2_policy_coverage.add(policy_name)
        check_value(procedure["output"]["$ref"], case["output"], name + " output")
        if case["input"]["procedure_id"] != procedure_id or case["output"]["procedure_id"] != procedure_id:
            raise ValueError(f"{name}: procedure identity mismatch")
        if case["output"]["outcome"] == "committed" and case.get("input_valid", True):
            procedure_coverage.add(procedure_id)
    if procedure_coverage != procedures.keys():
        raise ValueError(f"Missing worked controlled success: {sorted(procedures.keys() - procedure_coverage)}")
    if stage2_policy_coverage != stage2_policies.keys():
        raise ValueError(f"Missing committed Stage 2 policy example: {sorted(stage2_policies.keys() - stage2_policy_coverage)}")

    # Validate internal synchronous participants (no public HTTP routes)
    participant_groups = [
        document.get("x-stage2-evidence-participants", {}),
        document.get("x-stage2-shortage-participants", {}),
        document.get("x-stage2-donation-participants", {}),
        document.get("x-stage2-receiving-participants", {}),
    ]
    participants = {}
    for group in participant_groups:
        if participants.keys() & group.keys():
            raise ValueError("Duplicate internal participant ID")
        participants |= group
    if participants.keys() & operations.keys():
        raise ValueError("Internal participant exposed as public HTTP operationId")
    participant_coverage = set()
    for case in examples.get("participant_cases", []):
        name = case["name"]
        if name in names:
            raise ValueError(f"Duplicate consumer case: {name}")
        names.add(name)
        participant_id = case["participantId"]
        participant = participants[participant_id]
        check_value(participant["input"]["$ref"], case["input"], name + " input", case.get("input_valid", True))
        check_value(participant["output"]["$ref"], case["output"], name + " output")
        if participant_id == "computeNetShortageSnapshot" and case["output"]["outcome"] == "ready":
            for idx, item in enumerate(case["output"]["items"]):
                check_replenishment_math(item, f"{name}[{idx}]")
        if participant_id == "prepareReceivingInventory" and case.get("input_valid", True):
            check_prepare_receiving_invariants(case["input"], case["output"], name)
        if case["output"]["outcome"] == "ready" and case.get("input_valid", True):
            participant_coverage.add(participant_id)
    if participant_coverage != participants.keys():
        raise ValueError(f"Missing worked participant success: {sorted(participants.keys() - participant_coverage)}")

    print(
        "Versions: "
        + ", ".join(
            f"{pkg}={version(pkg)}" for pkg in ("openapi-spec-validator", "jsonschema", "PyYAML", "referencing")
        )
    )
    print(
        f"PASS OpenAPI 3.1.1; local references; {len(operations)} operations; "
        f"{len(procedures)} controlled procedures; {len(stage2_policies)} Stage 2 policies; "
        f"{len(participants)} internal participants; {len(names)} worked cases; "
        f"{checked} schema/example checks"
    )
    if args.invalid_example:
        probes = [
            (
                "#/components/schemas/CreateRepfRequest",
                {
                    "funding_source": "chapter_funds",
                    "urgency": "urgent",
                    "justification": "Attempted unpaid Sales Order shortage relabeling.",
                    "lines": [
                        {
                            "trigger_kind": "so_shortage",
                            "variant_id": "95000000-0000-4000-8000-000000000051",
                            "unit_id": "95000000-0000-4000-8000-000000000052",
                            "rf_id": None,
                            "rf_line_id": None,
                            "requested_quantity": "5",
                            "estimated_unit_cost_php": "250.00",
                            "needed_by": None,
                            "additional_purchase_reason": None,
                            "notes": None,
                        }
                    ],
                },
                "deliberately invalid so_shortage RepF trigger",
            ),
            (
                "#/components/schemas/ReplenishmentNeedList",
                {
                    "data": [{"unexpected_field": True, "usable_stockroom_on_hand": "-5"}],
                    "page": {"next_cursor": None, "snapshot_version": 0},
                },
                "deliberately invalid replenishment response",
            ),
            (
                "#/components/schemas/CreateRepfQuotationRequest",
                {
                    "supplier": {
                        "supplier_name": "Invalid Vendor",
                        "supplier_subtype": "unregistered_entity",
                        "contact_reference": "0917-000-0000",
                        "supplier_reference": None,
                    },
                    "quoted_at": "2026-11-26T04:00:00.000000Z",
                    "valid_until": "2026-12-10",
                    "lead_time_days": 5,
                    "availability_summary": "In stock",
                    "quality_warranty_terms": "30 days",
                    "payment_and_delivery_terms": "COD",
                    "reliability_notes": None,
                    "evidence": None,
                    "lines": [],
                },
                "deliberately invalid quotation supplier_subtype and empty lines",
            ),
            (
                "#/components/schemas/PurchaseOrderConflict",
                {
                    "request_id": "55000000-0000-4000-8000-000000000999",
                    "error": {
                        "code": "quotation_policy_unmet",
                        "message": "Minimum quotes not met.",
                    },
                    "failed_intent_committed": False,
                    "current": None,
                    "setup_blockers": [],
                    "policy_evaluation": None,
                },
                "deliberately invalid quotation_policy_unmet conflict missing policy_evaluation",
            ),
            (
                "#/components/schemas/CreateReceivingReportRequest",
                {
                    "source_kind": "ipc",
                    "source_id": "95000000-0000-4000-8000-000000000099",
                    "source_material_version": 1,
                    "originating_hold_id": None,
                    "supplier_dr_reference": None,
                    "supplier_dr_date": None,
                    "location_id": "95000000-0000-4000-8000-000000000088",
                    "lines": [],
                },
                "deliberately invalid Stage 2 Receiving Report attempting source_kind ipc",
            ),
            (
                "#/components/schemas/LinkReceivingHoldSourceRequest",
                {
                    "expected_version": 1,
                    "expected_material_version": 1,
                    "source_kind": "ipc",
                    "source_id": "95000000-0000-4000-8000-000000000099",
                    "supplier_dr_reference": None,
                    "supplier_dr_date": None,
                    "link_notes": "Attempted forbidden IPC link.",
                },
                "deliberately invalid missing-source hold link attempting source_kind ipc",
            ),
            (
                "#/components/schemas/ReceivingDiscrepancy",
                {
                    "id": "96000000-0000-4000-8000-000000000099",
                    "chapter_id": "60000000-0000-4000-8000-000000000001",
                    "status": "open",
                    "version": 1,
                    "material_version": 1,
                    "source_kind": "po",
                    "source_id": "96000000-0000-4000-8000-000000000001",
                    "source_reference": "PO-2026-0001",
                    "source_line_id": "96000000-0000-4000-8000-000000000002",
                    "rm_id": "96000000-0000-4000-8000-000000000003",
                    "rm_reference": "RM-2026-0002",
                    "rm_line_id": "96000000-0000-4000-8000-000000000004",
                    "variant_id": "95000000-0000-4000-8000-000000000051",
                    "unit_id": "95000000-0000-4000-8000-000000000052",
                    "quantity_scale": 0,
                    "damaged_quantity": "0",
                    "rejected_quantity": "10",
                    "total_discrepant_quantity": "10",
                    "quarantined_lot_id": None,
                    "rejected_lot_id": "96000000-0000-4000-8000-000000000005",
                    "quarantined_lots_auto_cleared_on_source_close": True,
                    "discrepancy_notes": "Wrong print alignment.",
                    "supplier_notification": None,
                    "review_started_by": None,
                    "review_started_at": None,
                    "review_notes": None,
                    "resolution": None,
                    "created_at": "2026-11-26T08:00:00.000000Z",
                    "updated_at": "2026-11-26T08:00:00.000000Z",
                },
                "deliberately invalid discrepancy claiming quarantined lots auto-clear on source close",
            ),
            (
                "#/components/schemas/AllocationEligibleSourceLot",
                {
                    "stock_lot_id": "97600000-0000-4000-8000-000000000099",
                    "source_kind": "da_rm",
                    "source_reference": "RM-2026-0003",
                    "location_id": "61000000-0000-4000-8000-000000000001",
                    "free_quantity": "10",
                    "restriction_state": "uninterpreted",
                },
                "deliberately invalid allocation queue source exposing ADR 0004 uninterpreted lot as eligible",
            ),
            (
                "#/components/schemas/OfficerAlertList",
                {
                    "data": [],
                    "caller_matched_duties": ["RECEIVING"],
                    "persisted_ack_supported": True,
                    "observed_at": "2026-11-27T10:00:00.000000Z",
                    "page": {"next_cursor": None, "snapshot_version": 23},
                },
                "deliberately invalid officer alert list claiming persisted_ack_supported: true",
            ),
            (
                "#/components/schemas/ControlDonationRestrictionRow",
                {
                    "da_id": "92000000-0000-4000-8000-000000000001",
                    "da_reference": "DA-2026-0001",
                    "da_status": "received",
                    "donor_name": "Youth Civic Foundation",
                    "location_id": "61000000-0000-4000-8000-000000000001",
                    "item_id": "95000000-0000-4000-8000-000000000050",
                    "variant_id": "95000000-0000-4000-8000-000000000051",
                    "variant_code": "TSHIRT-M",
                    "unit_id": "95000000-0000-4000-8000-000000000052",
                    "unit_code": "PCS",
                    "quantity_scale": 0,
                    "declared_quantity": "10",
                    "received_quantity": "10",
                    "declared_value_php": "2400.00",
                    "restriction": {
                        "state": "uninterpreted",
                        "allowed_uses": [],
                        "event_ids": [],
                        "requesting_unit_ids": [],
                        "effective_from": None,
                        "effective_until": None,
                        "interpretation_id": None,
                        "source_condition_reference": "Pending donor letter",
                    },
                    "allocatable_now": True,
                },
                "deliberately invalid control report row marking ADR 0004 uninterpreted donation allocatable_now: true",
            ),
        ]
        rejections = []
        for schema_ptr, payload, probe_label in probes:
            try:
                check_value(schema_ptr, payload, probe_label)
            except ValueError as err:
                rejections.append(str(err))
            else:
                raise ValueError(f"Invalid-example probe unexpectedly passed: {probe_label}")
        raise ValueError("; ".join(rejections))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"FAIL {type(error).__name__}: {error}" if isinstance(error, ValueError) else f"FAIL {type(error).__name__}")
        raise SystemExit(1) from None
