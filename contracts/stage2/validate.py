"""Validate the canonical Stage 2 OpenAPI 3.1.1 contract and published examples."""

import argparse
import json
from decimal import Decimal, ROUND_HALF_UP
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


def check_repf_invariants(repf, label):
    """Verify RepF exact decimal totals, line quantity conservation, trigger uniqueness, and net-need math."""
    two_dp = Decimal("0.01")
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
        expected_line_total = (req * Decimal(line["estimated_unit_cost_php"])).quantize(
            two_dp, rounding=ROUND_HALF_UP
        )
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

    # Verify ProcurementOperationName enum values resolve to actual public unsafe operations
    proc_ops = set(document["components"]["schemas"]["ProcurementOperationName"]["enum"])
    unknown_proc_ops = proc_ops - unsafe_operations
    if unknown_proc_ops:
        raise ValueError(f"ProcurementOperationName references non-unsafe or unknown operations: {sorted(unknown_proc_ops)}")

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
                elif case["operationId"] in proc_ops | {"findProcurementOperationByKey", "readProcurementOperation"}:
                    if isinstance(body_data, dict) and body_data.get("resource_kind") == "repf":
                        check_repf_invariants(body_data["result"], name)
        elif "body" in response:
            raise ValueError(f"{name}: bodyless status contains a body")
        response_headers = examples["response_defaults"]["headers"] | response.get("headers", {})
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
            for field in response["body"]["error"]["fields"]:
                field_pointer = field["pointer"]
                if field_pointer and field["code"] != "unexpected_field":
                    key = field_pointer.split("/")[1].replace("~1", "/").replace("~0", "~")
                    if key not in schema.get("properties", {}):
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
