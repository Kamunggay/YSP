"""Combined inventory and worked-journey checks for this contract package only."""

from decimal import Decimal


def require(condition, message):
    if not condition:
        raise ValueError(message)


def validate_handoff(handoff, document, examples, operations):
    cases = {case['name']: case for case in examples['cases']}
    listed = set()
    for name, profile in handoff['profiles'].items():
        for field in ('owner', 'ui_consumer', 'reviewers', 'agreement', 'requirements',
                      'source_nodes', 'coverage_limit', 'existence'):
            require(bool(profile.get(field)), f'Missing handoff profile {name}/{field}')
        for operation_id, location in profile['operations'].items():
            require(operation_id not in listed, f'Duplicate handoff operation: {operation_id}')
            require(operation_id in operations, f'Unknown handoff operation: {operation_id}')
            listed.add(operation_id)
            pointer, operation = operations[operation_id]
            path = location['path'].replace('~', '~0').replace('/', '~1')
            require(pointer == f"#/paths/{path}/{location['method'].lower()}",
                    f'Handoff method/path differs: {operation_id}')
            expected = 'existing' if operation_id == 'readScaffoldHealth' else 'specified_only'
            require(profile['existence'] == expected, f'Wrong existence status: {operation_id}')
            require(operation['x-existence'] == ('existing' if expected == 'existing' else 'new'),
                    f'Canonical existence differs: {operation_id}')
            if 'x-owner' in operation:
                require(profile['owner'] == operation['x-owner'], f'Owner differs: {operation_id}')
    require(listed == operations.keys(), 'Combined handoff operation inventory differs')

    groups = {
        'controlled_procedures': ['x-controlled-procedures'],
        'internal_participants': ['x-evidence-participants', 'x-opening-inventory-participants',
                                  'x-reservation-participants', 'x-actual-issue-participants'],
    }
    for kind, extensions in groups.items():
        expected = {key: (extension, value) for extension in extensions
                    for key, value in document[extension].items()}
        require(handoff[kind].keys() == expected.keys(), f'Combined {kind} inventory differs')
        for key, entry in handoff[kind].items():
            extension, canonical = expected[key]
            require(entry['canonical'] == f'openapi.yaml#/{extension}/{key}',
                    f'Wrong canonical participant/procedure: {key}')
            require(entry['owner'] == canonical.get('owner', 'Leader'), f'Wrong owner: {key}')

    ranges = {'GOV': 9, 'SEC': 3, 'DOC': 11, 'INV': 14, 'RF': 8, 'RCV': 13, 'ADD-AC': 12}
    expected = {f'{prefix}-{number:02}' for prefix, last in ranges.items()
                for number in range(1, last + 1)} | {'MIG-04', 'AC-01', 'AC-02', 'AC-04', 'AC-19'}
    coverage = handoff['requirement_coverage']
    require(coverage.keys() == expected, 'Combined requirement disposition inventory differs')
    for requirement, entry in coverage.items():
        require(entry['disposition'] in {'stage1_contract', 'partial', 'later_stage'} and
                bool(entry['scope']) and bool(entry['profiles']) and
                set(entry['profiles']) <= handoff['profiles'].keys(),
                f'Invalid requirement disposition: {requirement}')
    for journey in handoff['journeys'].values():
        require(bool(journey['fixture']) and bool(journey['cases']) and
                set(journey['cases']) <= cases.keys(), 'Unknown journey example or fixture')
    for category, names in handoff['example_categories'].items():
        require(bool(names) and set(names) <= cases.keys(), f'Unknown example category: {category}')

    validate_joined_issue(cases)
    validate_exact_reservation_and_holds(cases)
    print(f'PASS combined handoff: {len(listed)} HTTP; {len(coverage)} requirement dispositions; '
          f"{len(handoff['journeys'])} linked journeys; source/progress/recovery/hold arithmetic")


def validate_joined_issue(cases):
    def data(name):
        return cases[name]['response']['body']['data']

    opening = data('opening-postOpeningRm')['posting']
    lot = data('opening-read-stock-lot-usable')
    stock = data('opening-stock-summary-reconciles')
    rf = data('issue08-approved-rf-matches-opening-variant')
    require(rf['requester_id'] != rf['approval']['actor']['user_id'],
            'Joined RF lacks independent approval')
    require(len(stock['views']) == 7 and stock['views_are_additive'] is False,
            'Joined opening loses seven nonadditive views')
    received = sum(Decimal(m['quantity']) for m in opening['movements'])
    require(received == Decimal(lot['quantity']) ==
            Decimal(stock['views']['usable_stockroom_on_hand']['quantity']),
            'Joined accepted opening does not reconcile')
    require(sum(Decimal(f['quantity']) for f in opening['findings']) ==
            Decimal(stock['views']['quarantined_rejected']['quantity']),
            'Joined nonusable findings do not reconcile')
    require((rf['chapter_id'], rf['lines'][0]['variant_id'], rf['lines'][0]['unit_id']) ==
            (lot['chapter_id'], lot['variant_id'], lot['unit_id']),
            'Joined RF differs from accepted source identity')

    issued, consumed, references, acknowledgments = Decimal(0), [], set(), set()
    for name in ('issue08-post-four-once', 'issue08-second-partial-two-own-paper',
                 'issue08-final-four-completes-approved-ten'):
        receipt = data(name)
        issue = receipt['result']
        posting = issue['posting']
        require(issue['chapter_id'] == lot['chapter_id'] and issue['rf_id'] == rf['id'],
                'Joined issue chapter/RF differs')
        require(issue['reference'] not in references and posting['acknowledgment_id'] not in acknowledgments,
                'Repeated partial lacks its own reference/acknowledgment')
        references.add(issue['reference'])
        acknowledgments.add(posting['acknowledgment_id'])
        for movement in posting['movements']:
            require((movement['chapter_id'], movement['variant_id'], movement['unit_id'],
                     movement['location_id'], movement['source']) ==
                    (lot['chapter_id'], lot['variant_id'], lot['unit_id'], lot['location_id'], lot['source']),
                    'Joined movement source identity differs from accepted lot')
            quantity = Decimal(movement['quantity'])
            require(quantity == sum(Decimal(r['quantity']) for r in movement['ranges']),
                    'Joined issue movement differs from exact ranges')
            for target in movement['ranges']:
                start = Decimal(target['offset_quantity'])
                end = start + Decimal(target['quantity'])
                require(target['stock_lot_id'] == lot['id'] and
                        target['basis_segment_id'] == lot['segments'][0]['basis_segment_id'] and
                        0 <= start < end <= received and
                        all(end <= left or start >= right for left, right in consumed),
                        'Joined issue repeats or changes accepted source coordinates')
                consumed.append((start, end))
            issued += quantity
        progress = posting['lines'][0]['progress']
        approved = Decimal(progress['approved_quantity'])
        remaining = approved - issued - Decimal(progress['canceled_quantity'])
        require(issued == Decimal(progress['issued_quantity']) and remaining >= 0 and
                remaining == Decimal(progress['remaining_quantity']) and
                remaining - Decimal(progress['reserved_quantity']) == Decimal(progress['unreserved_quantity']) and
                issued <= received and approved == Decimal(rf['lines'][0]['requested_quantity']),
                'Joined cumulative issue/reservation/demand arithmetic differs')

    first = data('issue08-post-four-once')
    for name in ('issue08-lost-response-find-original-result', 'issue08-recover-operation-id',
                 'issue08-authorized-same-key-replay-four-only'):
        require(data(name) == first, 'Authorized recovered outcome differs from original issue')


def validate_exact_reservation_and_holds(cases):
    failed_case = cases['reservation-exact-ten-only-six-zero-commit']
    failed = failed_case['response']['body']
    prepare = cases['combined10-prepare-six-new-intent']
    prepared = prepare['response']['body']['data']['result']
    commit = cases['combined10-commit-six-new-intent']
    reserved = commit['response']['body']['data']['result']
    require(failed_case['response']['status'] == '409' and failed['failed_intent_committed'] is False and
            failed['current']['reservation'] is None and
            Decimal(failed['current']['review']['free_eligible_quantity']) == 6,
            'Exact-ten failure commits or hides current six')
    require(prepared['id'] != failed_case['request']['path']['preparation_id'] and
            commit['request']['path']['preparation_id'] == prepared['id'] and
            len({c['request']['headers']['X-Action-Key'] for c in (failed_case, prepare, commit)}) == 3,
            'Explicit six reuses immutable ten preparation/action key')
    selected = sum(Decimal(t['quantity']) for t in prepared['selection']['targets'])
    require(selected == Decimal(reserved['active_quantity']) == 6 and
            Decimal(reserved['demand']['unreserved_quantity']) == 4 and
            reserved['demand']['approved_quantity'] == '10',
            'Explicit six loses four outstanding')
    lot = cases['reservation-stock-overlap-union-once']['response']['body']['data']
    segments = lot['segments']
    physical = sum(Decimal(s['quantity']) for s in segments)
    reserved_quantity = sum(Decimal(s['quantity']) for s in segments if s['reservation'])
    held = sum(Decimal(s['quantity']) for s in segments if s['hold_ids'])
    free = sum(Decimal(s['quantity']) for s in segments if not s['reservation'] and not s['hold_ids'])
    require(physical == Decimal(lot['quantity']) == 10 and reserved_quantity == held == 6 and free == 4,
            'Held/reserved union double-subtracted or physical quantity changed')
    one = cases['reservation-after-one-clear-still-blocked-four']['response']['body']['data']
    all_clear = cases['reservation-after-every-hold-clear-unchanged-material']['response']['body']['data']
    require(one['blocked_quantity'] == '4' and all_clear['blocked_quantity'] == '0' and
            one['active_quantity'] == all_clear['active_quantity'] == '6' and
            one['material_version'] == all_clear['material_version'],
            'Hold clearance loses reservation or changes unchanged material')
