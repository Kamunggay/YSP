"""Validate the canonical Stage 2 OpenAPI 3.1.1 contract and published examples."""

import argparse
import json
from decimal import Decimal
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


def check_replenishment_math(item, label):
    """Verify INV-10..INV-12 non-overlapping exact decimal math on worked examples."""
    d = lambda field: Decimal(item[field])
    zero = Decimal("0")
    if d("eligible_usable_stockroom_on_hand") > d("usable_stockroom_on_hand"):
        raise ValueError(f"{label}: eligible usable stock exceeds usable stockroom on-hand")
    expected_avail = max(zero, d("eligible_usable_stockroom_on_hand") - d("active_rf_reservations"))
    if d("eligible_available_to_allocate") != expected_avail:
        raise ValueError(f"{label}: eligible_available_to_allocate mismatch")
    expected_rf_short = max(zero, d("total_unreserved_approved_rf_demand") - expected_avail)
    if d("unreserved_approved_rf_shortage") != expected_rf_short:
        raise ValueError(f"{label}: unreserved_approved_rf_shortage mismatch")
    if d("gross_rf_shortage_need") != expected_rf_short:
        raise ValueError(f"{label}: gross_rf_shortage_need differs from unreserved_approved_rf_shortage")
    expected_inbound = d("open_repf_quantity") + d("open_po_inbound_quantity")
    if d("total_open_inbound_coverage") != expected_inbound:
        raise ValueError(f"{label}: total_open_inbound_coverage mismatch")
    approved_rop = Decimal(item["approved_rop"]) if item["approved_rop"] is not None else None
    expected_breach = approved_rop is not None and d("usable_stockroom_on_hand") <= approved_rop
    if item["low_stock_breach"] != expected_breach:
        raise ValueError(f"{label}: low_stock_breach indicator mismatch")
    approved_target = Decimal(item["approved_target_level"]) if item["approved_target_level"] is not None else None
    post_rf = d("eligible_usable_stockroom_on_hand") - d("active_rf_reservations") - d("total_unreserved_approved_rf_demand")
    expected_rop_gross = (
        max(zero, approved_target - max(zero, post_rf))
        if expected_breach and approved_target is not None
        else zero
    )
    if d("gross_rop_replenishment_need") != expected_rop_gross:
        raise ValueError(f"{label}: gross_rop_replenishment_need mismatch")
    if d("gross_combined_need") != expected_rf_short + expected_rop_gross:
        raise ValueError(f"{label}: gross_combined_need overlaps RF shortage and ROP")
    expected_uncovered_rf = max(zero, expected_rf_short - expected_inbound)
    remaining_inbound = max(zero, expected_inbound - expected_rf_short)
    expected_uncovered_rop = max(zero, expected_rop_gross - remaining_inbound)
    if d("uncovered_rf_shortage_quantity") != expected_uncovered_rf:
        raise ValueError(f"{label}: uncovered_rf_shortage_quantity mismatch")
    if d("uncovered_rop_replenishment_quantity") != expected_uncovered_rop:
        raise ValueError(f"{label}: uncovered_rop_replenishment_quantity mismatch")
    if d("proposed_uncovered_quantity") != expected_uncovered_rf + expected_uncovered_rop:
        raise ValueError(f"{label}: proposed_uncovered_quantity mismatch")
    counted_sources = sum(
        (Decimal(src["open_quantity"]) for src in item["inbound_sources"] if src["coverage_state"] == "counted"),
        zero,
    )
    excluded_sources = sum(
        (Decimal(src["open_quantity"]) for src in item["inbound_sources"] if src["coverage_state"] != "counted"),
        zero,
    )
    if counted_sources != expected_inbound or excluded_sources != d("excluded_inbound_quantity"):
        raise ValueError(f"{label}: inbound_sources breakdown does not sum to totals")


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

    check_references(document)
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

    # Verify Stage 2 additive EvidencePurpose enum coverage
    purposes = set(document["components"]["schemas"]["EvidencePurpose"]["enum"])
    if not (STAGE1_EVIDENCE_PURPOSES | STAGE2_EVIDENCE_PURPOSES) <= purposes:
        raise ValueError("EvidencePurpose is missing Stage 1 or additive Stage 2 values")

    # Verify action duties use canonical 14-duty vocabulary
    valid_duties = set(document["components"]["schemas"]["Duty"]["enum"])
    action_duties = document.get("x-stage2-action-duties", {})
    for action, duties in action_duties.items():
        if not duties or not set(duties) <= valid_duties:
            raise ValueError(f"Action {action} references invalid or empty duties")

    operations = {}
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
        check_value(
            "#/components/schemas/ReplenishmentNeedList",
            {
                "data": [{"unexpected_field": True, "usable_stockroom_on_hand": "-5"}],
                "page": {"next_cursor": None, "snapshot_version": 0},
            },
            "deliberately invalid replenishment response",
        )
        raise ValueError("Invalid-example probe unexpectedly passed")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"FAIL {type(error).__name__}: {error}" if isinstance(error, ValueError) else f"FAIL {type(error).__name__}")
        raise SystemExit(1) from None
