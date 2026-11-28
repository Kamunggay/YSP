<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Receiving Report {{ $report['rm_reference'] ?? 'DRAFT' }}</title>
</head>
<body>
    <h1>Receiving Report {{ $report['rm_reference'] ?? 'DRAFT' }}</h1>
    <p>{{ $chapter }} · {{ strtoupper($report['source_kind']) }} · {{ $report['status'] }} · Version {{ $report['version'] }} (material {{ $report['material_version'] }})</p>
    <p>Source {{ strtoupper($report['source_kind']) }} {{ $report['source_reference'] }} (material {{ $report['source_material_version'] }})</p>
    @if ($report['source_kind'] === 'po')
        <p>Supplier DR {{ $report['supplier_dr_reference'] }} · Date {{ $report['supplier_dr_date'] }}</p>
    @endif
    <p>Stockroom Location {{ $location ? ($location->code ? $location->code . ' — ' . $location->name : $location->name) : $report['location_id'] }}</p>
    <p>Currency {{ $report['currency'] }} · Accepted Total PHP {{ $report['accepted_total_value_php'] }}</p>

    <section>
        <h2>Inspection &amp; Attribution</h2>
        <p>Prepared by {{ $report['preparer']['display_name'] }}</p>
        @if ($report['inspection'])
            <p>Inspected by {{ $report['inspection']['inspector']['display_name'] }} at {{ $report['inspection']['inspected_at'] }}</p>
            @if ($report['inspection']['technical_or_requesting_representative'])
                <p>Representative: {{ $report['inspection']['technical_or_requesting_representative']['display_name'] }}</p>
            @endif
            <p>Inspection Notes: {{ $report['inspection']['inspection_notes'] }}</p>
        @endif
        @if ($report['posted_by'])
            <p>Posted by {{ $report['posted_by']['display_name'] }} at {{ $report['posted_at'] }} (stock version {{ $report['posting_stock_version'] }})</p>
        @endif
        @if ($report['canceled_by'])
            <p>Canceled by {{ $report['canceled_by']['display_name'] }} at {{ $report['canceled_at'] }}: {{ $report['cancel_reason'] }}</p>
        @endif
    </section>

    <section>
        <h2>Lines</h2>
        @foreach ($report['lines'] as $index => $line)
            @php($model = $lines[$index] ?? null)
            <article>
                <h3>Line {{ $index + 1 }} · {{ $model?->variant?->item?->name ?? $line['variant_id'] }} ({{ $model?->variant?->code ?? $model?->variant?->sku ?? $line['variant_id'] }})</h3>
                <p>Delivered {{ $line['delivered_quantity'] }} · Accepted {{ $line['accepted_quantity'] }} · Damaged {{ $line['damaged_quantity'] }} · Rejected {{ $line['rejected_quantity'] }}</p>
                <p>Unit Valuation PHP {{ $line['unit_valuation_php'] }} · Accepted Value PHP {{ $line['accepted_value_php'] }}</p>
                @if ($report['source_kind'] === 'da')
                    <p>Donor Restriction State: {{ $line['restrictions']['state'] }}@if ($line['restrictions']['source_condition_reference']) · {{ $line['restrictions']['source_condition_reference'] }}@endif</p>
                @endif
                @if ($line['discrepancy_notes'])
                    <p>Discrepancy Notes: {{ $line['discrepancy_notes'] }}</p>
                @endif
            </article>
        @endforeach
    </section>

    <section>
        <h2>Sign-Off</h2>
        <p>Receiving Officer: ______________________ &nbsp; Inspector: ______________________ &nbsp; Date: ______________</p>
    </section>
</body>
</html>
