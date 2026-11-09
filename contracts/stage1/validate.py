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
        if "content" in definition:
            response_media = response.get("media_type", "application/json")
            check_value(response_pointer + "/content/" + pointer_part(response_media) + "/schema",
                        response["body"], name + " response")
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
            policy_definition = document.get("x-catalogue-policy-values", {}).get(policy["setting_key"])
            if policy_definition:
                value_pointer = policy_definition["schema"]["$ref"]
                if policy["value_schema_reference"] != value_pointer:
                    raise ValueError(f"{name}: policy value reference differs from canonical setting schema")
                if policy["subject_id"] is None or policy["ownership"] != policy_definition["ownership"]:
                    raise ValueError(f"{name}: policy subject/ownership does not match its catalogue setting")
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
    if evidence_participants.keys() & inventory_participants.keys():
        raise ValueError("Duplicate internal participant ID")
    participants = evidence_participants | inventory_participants
    participant_coverage = set()
    for case in examples.get("participant_cases", []) + examples.get("opening_inventory_cases", []):
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
    print("Versions: " + ", ".join(f"{name}={version(name)}" for name in
                                    ("openapi-spec-validator", "jsonschema", "PyYAML")))
    print(f"PASS OpenAPI 3.1.1; local references; {len(operations)} operations; "
          f"{len(procedures)} controlled procedures; {len(names)} consumer cases; "
          f"{len(evidence_participants)} evidence participants; "
          f"{len(inventory_participants)} opening Inventory participants; {checked} schema/example checks")
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
