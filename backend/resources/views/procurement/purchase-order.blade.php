<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Purchase Order {{ $po['po_reference'] ?? 'DRAFT' }}</title>
</head>
<body>
    <h1>Purchase Order {{ $po['po_reference'] ?? 'DRAFT' }}</h1>
    <p>{{ $chapter }} · {{ $po['status'] }} · Version {{ $po['version'] }} (material {{ $po['material_version'] }})</p>
    <p>RepF {{ $po['repf_reference'] }} · Currency {{ $po['currency'] }} · Total PHP {{ $po['total_amount_php'] }}</p>
    @if ($po['linked_demand_canceled'])
        <p>Linked RF demand was canceled.</p>
    @endif
    <section>
        <h2>Supplier</h2>
        <p>{{ $po['supplier']['supplier_name'] }} ({{ $po['supplier']['supplier_subtype'] }}) · {{ $po['supplier']['contact_reference'] }}
            @if ($po['supplier']['supplier_reference']) · Ref {{ $po['supplier']['supplier_reference'] }} @endif
        </p>
        <p>Delivery: {{ $po['delivery_location'] }} · Expected {{ $po['expected_delivery_date'] }}</p>
        <p>Terms: {{ $po['payment_and_delivery_terms'] }}</p>
    </section>
    <section>
        <h2>Attribution</h2>
        <p>Prepared by {{ $po['preparer']['display_name'] }} · Originating RepF preparer {{ $po['originating_repf_preparer']['display_name'] }}</p>
        @if ($po['approved_by'])
            <p>Approved by {{ $po['approved_by']['display_name'] }} at {{ $po['approved_at'] }}</p>
        @endif
        @if ($po['acknowledgment'])
            <p>Supplier acknowledged at {{ $po['acknowledgment']['acknowledged_at'] }}
                @if ($po['acknowledgment']['supplier_confirmation_reference']) · Ref {{ $po['acknowledgment']['supplier_confirmation_reference'] }} @endif
                @if ($po['acknowledgment']['revised_expected_delivery_date']) · Revised ETA {{ $po['acknowledgment']['revised_expected_delivery_date'] }} @endif
            </p>
            @if ($po['acknowledgment']['notes'])
                <p>{{ $po['acknowledgment']['notes'] }}</p>
            @endif
        @endif
        @if ($po['close_short_reason'])
            <p>Closed short: {{ $po['close_short_reason'] }}</p>
        @endif
        @if ($po['cancel_reason'])
            <p>Canceled: {{ $po['cancel_reason'] }}</p>
        @endif
    </section>
    <section>
        <h2>Lines</h2>
        @foreach ($po['lines'] as $index => $line)
            <article>
                <h3>Line {{ $index + 1 }} · {{ $line['specifications'] }}</h3>
                <p>Ordered {{ $line['ordered_quantity'] }} · Accepted {{ $line['accepted_quantity'] }} · Rejected/Disputed {{ $line['rejected_or_disputed_quantity'] }} · Closed short {{ $line['closed_short_quantity'] }} · Canceled {{ $line['canceled_quantity'] }} · Outstanding {{ $line['outstanding_quantity'] }}</p>
                <p>Unit PHP {{ $line['unit_price_php'] }} · Line Total PHP {{ $line['line_total_php'] }}</p>
                @if ($line['linked_demand_canceled'])
                    <p>Linked RF demand was canceled.</p>
                @endif
                @if ($line['notes'])
                    <p>{{ $line['notes'] }}</p>
                @endif
            </article>
        @endforeach
    </section>
</body>
</html>
