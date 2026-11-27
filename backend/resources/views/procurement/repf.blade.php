<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Replenishment Form {{ $repf['repf_reference'] ?? 'DRAFT' }}</title>
</head>
<body>
    <h1>Replenishment Form {{ $repf['repf_reference'] ?? 'DRAFT' }}</h1>
    <p>{{ $chapter }} · {{ $repf['status'] }} · Version {{ $repf['version'] }} (material {{ $repf['material_version'] }})</p>
    <p>Funding {{ $repf['funding_source'] }} · Urgency {{ $repf['urgency'] }}</p>
    <p>{{ $repf['justification'] }}</p>
    @if ($repf['linked_demand_canceled'])
        <p>Linked RF demand was canceled.</p>
    @endif
    <p>Prepared by {{ $repf['preparer']['display_name'] }}</p>
    @if ($repf['budget_reviewer'])
        <p>Reviewed by {{ $repf['budget_reviewer']['display_name'] }} · {{ $repf['budget_decision'] }} {{ $repf['budget_decision_reason'] }}</p>
    @endif
    <p>Estimated total PHP {{ $repf['estimated_total_php'] }}</p>
    @if ($repf['approved_budget_php'] !== null)
        <p>Approved budget PHP {{ $repf['approved_budget_php'] }}</p>
    @endif
    @foreach ($repf['lines'] as $line)
        <section>
            <h2>{{ $line['line_number'] }}. {{ $line['display_name'] }} ({{ $line['variant_code'] }})</h2>
            <p>{{ $line['trigger_kind'] }} {{ $line['rf_reference'] }} · {{ $line['requested_quantity'] }} {{ $line['unit_code'] }} · Estimated PHP {{ $line['estimated_line_total_php'] }}</p>
            @if ($line['linked_demand_canceled'])
                <p>Linked RF demand was canceled.</p>
            @endif
            <dl>
                @foreach ($line['net_need_breakdown'] as $field => $value)
                    <dt>{{ ucfirst(str_replace('_', ' ', $field)) }}</dt>
                    <dd>{{ is_bool($value) ? ($value ? 'Yes' : 'No') : ($value ?? '—') }}</dd>
                @endforeach
            </dl>
            @if ($line['additional_purchase_reason'])
                <p>{{ $line['additional_purchase_reason']['category'] }} · {{ $line['additional_purchase_reason']['explanation'] }}</p>
            @endif
            <p>{{ $line['notes'] }}</p>
        </section>
    @endforeach
</body>
</html>
