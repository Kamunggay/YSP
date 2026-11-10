"""Validate only this canonical Stage 1 contract and its published examples."""

import argparse
import json
from importlib.metadata import version
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator, FormatChecker
from openapi_spec_validator import OpenAPIV31SpecValidator, validate
from referencing import Registry, Resource
from referencing.jsonschema import DRAFT202012


class UniqueKeysLoader(yaml.SafeLoader):
    """Do not silently overwrite a published operation/schema/example."""

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


def validate_notifications(root, document, examples, operations):
    """Check the separate event agreement against its schemas and canonical HTTP reads."""
    agreement = read_yaml(root / "events.yaml")
    schema = read_yaml(root / "events.schema.yaml")
    Draft202012Validator.check_schema(schema)
    validator = Draft202012Validator(schema, format_checker=FormatChecker())
    definitions = agreement["definitions"]
    schema_names = {part["$ref"].removeprefix("#/$defs/") for part in schema["oneOf"]}
    if {item["schema"].removeprefix("#/$defs/") for item in definitions.values()} != schema_names:
        raise ValueError("Event registry/schema coverage differs")
    methods = {operation["operationId"]: method
               for item in document["paths"].values() for method, operation in item.items()
               if isinstance(operation, dict) and "operationId" in operation}
    for name, definition in definitions.items():
        short = definition["schema"].removeprefix("#/$defs/")
        payload = schema["$defs"][short]["properties"]
        if payload["event_name"] != {"const": name} or not name.endswith(".v1"):
            raise ValueError(f"Event name/version mismatch: {name}")
        if definition["channel"] not in {"session", "chapter"}:
            raise ValueError(f"Unknown event channel: {name}")
        for operation_id in definition["refresh_operations"]:
            if methods.get(operation_id) != "get":
                raise ValueError(f"Event refresh is not a canonical safe read: {operation_id}")
        if definition["subject_schema"] is not None:
            subject = document["components"]["schemas"][definition["subject_schema"]]
            for field in ("id_field", "resource_version_field", "material_version_field"):
                path = definition[field]
                if path is None:
                    continue
                node = subject
                for part in path.split("."):
                    node = node["properties"][part]
                if field != "id_field" and node.get("type") != "integer":
                    raise ValueError(f"Event version differs from HTTP subject: {name}")
    dispositions = agreement["operation_disposition"]
    procedures = agreement["procedure_disposition"]
    if dispositions.keys() != operations.keys():
        raise ValueError("Event disposition does not cover exact HTTP operation inventory")
    if procedures.keys() != document.get("x-controlled-procedures", {}).keys():
        raise ValueError("Event disposition does not cover controlled procedure inventory")
    emitted = set()
    for operation_id, disposition in (dispositions | procedures).items():
        for name in disposition["events"]:
            if name not in definitions:
                raise ValueError(f"Undefined emitted event: {operation_id}")
            emitted.add(name)
        if not disposition["events"] and not (disposition.get("reason") or disposition.get("when")):
            raise ValueError(f"Missing no-notification reason: {operation_id}")
        if methods.get(operation_id) == "get" and disposition["events"]:
            raise ValueError(f"Safe read cannot emit a committed change: {operation_id}")
    if emitted != definitions.keys():
        raise ValueError("Event definitions include an undispositioned subject")
    http_cases = {case["name"]: case for case in examples["cases"]}
    positive, negative, names = set(), set(), set()
    for case in agreement["examples"]:
        if case["name"] in names:
            raise ValueError("Duplicate event example")
        names.add(case["name"])
        name = case["definition"]
        if name not in definitions or case["payload"].get("event_name") != name:
            raise ValueError(f"Event example identity mismatch: {case['name']}")
        valid = validator.is_valid(case["payload"])
        if valid != case["valid"]:
            raise ValueError(f"Event example validation mismatch: {case['name']}")
        if "current_http_case" in case:
            current = http_cases[case["current_http_case"]]
            if (not current["response"]["status"].startswith("2") or
                    current["operationId"] not in definitions[name]["refresh_operations"]):
                raise ValueError(f"Notice binding is not an authorized current read: {case['name']}")
            subject = current["response"]["body"]["data"]
            for payload_field, subject_field in (
                    ("resource_id", "id_field"), ("resource_version", "resource_version_field"),
                    ("material_version", "material_version_field")):
                field = definitions[name][subject_field]
                node = subject
                if field is not None:
                    for part in field.split("."):
                        node = node[part]
                else:
                    node = None
                if case["payload"][payload_field] != node:
                    raise ValueError(f"Notice version/identity differs from current read: {case['name']}")
            if case["payload"]["chapter_id"] != subject["chapter_id"]:
                raise ValueError(f"Notice chapter differs from current read: {case['name']}")
        (positive if valid else negative).add(name)
    if positive != definitions.keys() or negative != definitions.keys():
        raise ValueError("Every event needs valid and rejected examples")
    case_names = {case["name"] for case in examples["cases"]}
    scenarios = set()
    for scenario in agreement["scenarios"]:
        if scenario["name"] in scenarios:
            raise ValueError("Duplicate notification scenario")
        scenarios.add(scenario["name"])
        if not set(scenario["http_cases"]) <= case_names or not set(scenario["events"]) <= definitions.keys():
            raise ValueError(f"Unknown scenario HTTP case/event: {scenario['name']}")
        if not set(scenario.get("notice_examples", [])) <= names:
            raise ValueError(f"Unknown scenario notice example: {scenario['name']}")
        if "principal_case" in scenario:
            principal = http_cases[scenario["principal_case"]]["response"]["body"]["data"]
            context = http_cases[scenario["context_case"]]["response"]["body"]["data"]
            access = http_cases[scenario["access_case"]]["response"]["body"]["data"]
            memberships = http_cases[scenario["membership_case"]]["response"]["body"]["data"]
            if (principal["state"] != "authenticated" or
                    principal["user"]["id"] != context["user_id"] or
                    context["user_id"] != access["user_id"] or
                    context["membership"] not in memberships or
                    context["membership"]["chapter"]["id"] != access["chapter_id"]):
                raise ValueError(f"Reconnect principal/current authority differs: {scenario['name']}")
            action_states = {action["action"]: action["state"] for action in access["actions"]}
            for case_name in scenario["http_cases"]:
                current = http_cases[case_name]
                if not current["response"]["status"].startswith("2"):
                    continue
                chapter = current.get("request", {}).get("path", {}).get("chapter_id")
                if chapter is not None and chapter != access["chapter_id"]:
                    raise ValueError(f"Reconnect reads another chapter: {case_name}")
                _, operation = operations[current["operationId"]]
                required_action = operation.get("x-required-action", "")
                for action in required_action.split(" AND "):
                    if action and action_states.get(action) == "duty_denied":
                        raise ValueError(f"Reconnect read contradicts current duties: {case_name}")
                if current["operationId"] in {"authorizeSessionNotifications", "authorizeChapterNotifications"}:
                    channel = current["request"]["body"]["channel_name"]
                    prefix = "private-stage1."
                    if chapter is not None:
                        prefix += f"chapter.{chapter}."
                    if channel != prefix + "user." + principal["user"]["id"]:
                        raise ValueError(f"Reconnect authorizes another user: {case_name}")
    required = {"committed-change", "failed-command", "duplicate-or-delayed", "missed-event-reconnect",
                "chapter-change", "revocation", "disabled-or-other-user", "preserved-edit"}
    if not required <= scenarios:
        raise ValueError("Missing required notification/reconnect scenario")
    print(f"PASS {len(definitions)} exact events; {len(names)} event examples; "
          f"{len(dispositions)} HTTP/{len(procedures)} procedure dispositions; "
          f"{len(scenarios)} worked notification scenarios")


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

    operations = {}
    for path, path_item in document["paths"].items():
        for method, operation in path_item.items():
            if method not in {"get", "post", "put", "patch", "delete", "options", "head", "trace"}:
                continue
            operation_id = operation["operationId"]
            if operation_id in operations:
                raise ValueError(f"Duplicate operation ID: {operation_id}")
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
                for media in response.get("content", {}):
                    check_inline_examples(response_pointer + "/content/" + pointer_part(media))
                for header in response.get("headers", {}):
                    header_pointer, _ = dereference(response_pointer + "/headers/" + pointer_part(header))
                    check_inline_examples(header_pointer)

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
            check_value(request_schema, request["body"],
                        name + " request", case.get("request_valid", True))
        elif "body" in request:
            raise ValueError(f"{name}: operation has no request body")
        request_headers = examples["request_defaults"]["headers"] | request.get("headers", {})
        request_locations = {"header": request_headers, "path": request.get("path", {}),
                             "query": request.get("query", {})}
        for index, _ in enumerate(operation.get("parameters", [])):
            parameter_pointer, parameter = dereference(pointer + f"/parameters/{index}")
            values = request_locations[parameter["in"]]
            if parameter["name"] not in values:
                if parameter.get("required", False):
                    raise ValueError(f"{name}: missing {parameter['in']} parameter {parameter['name']}")
                continue
            check_value(parameter_pointer + "/schema", values[parameter["name"]],
                        name + " " + parameter["in"],
                        parameter["in"] + "." + parameter["name"] not in case.get("invalid_parameters", []))
        response = case["response"]
        status = response["status"]
        response_pointer, definition = dereference(pointer + "/responses/" + status)
        if status.startswith("2"):
            covered.add(case["operationId"])
            rf_mutations = document["components"]["schemas"].get("RfMutationName", {}).get("enum", [])
            reservation_mutations = document["components"]["schemas"].get("ReservationMutationName", {}).get("enum", [])
            issue_mutations = document["components"]["schemas"].get("IssueMutationName", {}).get("enum", [])
            if case["operationId"] in rf_mutations + reservation_mutations + issue_mutations:
                receipt = response["body"]["data"]
                if (receipt["operation_name"] != case["operationId"] or
                        receipt["action_key"] != request_headers["X-Action-Key"]):
                    raise ValueError(f"{name}: receipt differs from originating operation/key")
        if "content" in definition:
            response_media = response.get("media_type", "application/json")
            check_value(response_pointer + "/content/" + pointer_part(response_media) + "/schema",
                        response["body"], name + " response")
            if case["operationId"] == "readChapterAccess" and status == "200":
                actions = response["body"]["data"]["actions"]
                expected_actions = document["components"]["schemas"]["Stage1Action"]["enum"]
                if [action["action"] for action in actions] != expected_actions:
                    raise ValueError(f"{name}: action inventory differs from canonical order/coverage")
                for action in actions:
                    if action["required_duties"] != document["x-stage1-action-duties"][action["action"]]:
                        raise ValueError(f"{name}: action duties differ from canonical mapping")
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
        if status == "422":
            _, schema = dereference(request_schema)
            for field in response["body"]["error"]["fields"]:
                field_pointer = field["pointer"]
                if field_pointer and field["code"] != "unexpected_field":
                    key = field_pointer.split("/")[1].replace("~1", "/").replace("~0", "~")
                    if key not in schema["properties"]:
                        raise ValueError(f"{name}: feedback points outside operation body")

    if covered != operations.keys():
        raise ValueError(f"Missing worked success: {sorted(operations.keys() - covered)}")
    procedures = document.get("x-controlled-procedures", {})
    procedure_coverage = set()
    for case in examples.get("procedure_cases", []):
        name = case["name"]
        if name in names:
            raise ValueError(f"Duplicate consumer case: {name}")
        names.add(name)
        procedure_id = case["procedureId"]
        procedure = procedures[procedure_id]
        check_value(procedure["input"]["$ref"], case["input"], name + " input",
                    case.get("input_valid", True))
        if procedure_id == "recordPolicy" and case.get("input_valid", True):
            policy = case["input"]["input"]
            catalogue_policy = document.get("x-catalogue-policy-values", {}).get(policy["setting_key"])
            opening_policy = document.get("x-opening-policy-values", {}).get(policy["setting_key"])
            policy_definition = catalogue_policy or opening_policy
            rf_policy = document.get("x-rf-policy-values", {}).get(policy["setting_key"])
            reservation_policy = document.get("x-reservation-policy-values", {}).get(policy["setting_key"])
            issue_policy = document.get("x-issue-policy-values", {}).get(policy["setting_key"])
            if reservation_policy:
                policy_definition = reservation_policy
            if rf_policy and (policy["setting_key"] == "rf_approval_route" or
                              policy["value_schema_reference"] == rf_policy["schema"]["$ref"]):
                policy_definition = rf_policy
            if issue_policy and policy["value_schema_reference"] == issue_policy["schema"]["$ref"]:
                policy_definition = issue_policy
            if policy_definition:
                value_pointer = policy_definition["schema"]["$ref"]
                if policy["value_schema_reference"] != value_pointer:
                    raise ValueError(f"{name}: policy value reference differs from canonical setting schema")
                subject_scope = policy_definition.get("subject_scope", policy_definition.get("subject_kind"))
                chapter_policy = subject_scope == "chapter"
                if ((policy["subject_id"] is None) != chapter_policy or
                        policy["ownership"] != policy_definition["ownership"]):
                    raise ValueError(f"{name}: policy subject/ownership does not match its setting")
                value = json.loads(policy["value"])
                if json.dumps(value, sort_keys=True, separators=(",", ":")) != policy["value"]:
                    raise ValueError(f"{name}: policy value is not canonical compact JSON")
                check_value(value_pointer, value, name + " decoded policy value",
                            case.get("policy_value_valid", True))
        check_value(procedure["output"]["$ref"], case["output"], name + " output")
        if case["input"]["procedure_id"] != procedure_id or case["output"]["procedure_id"] != procedure_id:
            raise ValueError(f"{name}: procedure identity mismatch")
        if case["output"]["outcome"] == "committed" and case.get("input_valid", True):
            procedure_coverage.add(procedure_id)
    if procedure_coverage != procedures.keys():
        raise ValueError(f"Missing worked controlled success: {sorted(procedures.keys() - procedure_coverage)}")
    evidence_participants = document.get("x-evidence-participants", {})
    inventory_participants = document.get("x-opening-inventory-participants", {})
    reservation_participants = document.get("x-reservation-participants", {})
    issue_participants = document.get("x-actual-issue-participants", {})
    if (evidence_participants.keys() & inventory_participants.keys() or
            (evidence_participants.keys() | inventory_participants.keys()) & reservation_participants.keys()):
        raise ValueError("Duplicate internal participant ID")
    participants = evidence_participants | inventory_participants | reservation_participants
    if participants.keys() & issue_participants.keys():
        raise ValueError("Duplicate internal participant ID")
    participants |= issue_participants
    participant_coverage = set()
    for case in (examples.get("participant_cases", []) + examples.get("opening_inventory_cases", []) +
                 examples.get("reservation_participant_cases", []) +
                 examples.get("actual_issue_inventory_cases", [])):
        name = case["name"]
        if name in names:
            raise ValueError(f"Duplicate consumer case: {name}")
        names.add(name)
        participant_id = case["participantId"]
        participant = participants[participant_id]
        check_value(participant["input"]["$ref"], case["input"], name + " input",
                    case.get("input_valid", True))
        check_value(participant["output"]["$ref"], case["output"], name + " output")
        if case["output"]["outcome"] == "ready" and case.get("input_valid", True):
            participant_coverage.add(participant_id)
    if participant_coverage != participants.keys():
        raise ValueError(f"Missing worked participant success: {sorted(participants.keys() - participant_coverage)}")
    validate_notifications(root, document, examples, operations)
    print("Versions: " + ", ".join(f"{name}={version(name)}" for name in
                                    ("openapi-spec-validator", "jsonschema", "PyYAML")))
    print(f"PASS OpenAPI 3.1.1; local references; {len(operations)} operations; "
          f"{len(procedures)} controlled procedures; {len(names)} consumer cases; "
          f"{len(evidence_participants)} evidence participants; "
          f"{len(inventory_participants)} opening Inventory participants; "
          f"{len(reservation_participants)} reservation participants; "
          f"{len(issue_participants)} actual issue Inventory participants; {checked} schema/example checks")
    if args.invalid_example:
        pointer, _ = operations["completeRecoveryChallenge"]
        check_value(pointer + "/requestBody/content/application~1json/schema",
                    {"recovery_code": 123456}, "deliberately invalid recovery request")
        raise ValueError("Invalid-example probe unexpectedly passed")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Published fixtures are synthetic; avoid rendering payload values in failures.
        print(f"FAIL {type(error).__name__}: {error}" if isinstance(error, ValueError)
              else f"FAIL {type(error).__name__}")
        raise SystemExit(1) from None
