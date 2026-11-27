<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>Donation Acknowledgment {{ $donation['reference'] ?? 'DRAFT' }}</title>
</head>
<body>
    <h1>Donation Acknowledgment {{ $donation['reference'] ?? 'DRAFT' }}</h1>
    <p>{{ $chapter }} · {{ $donation['status'] }} · Version {{ $donation['version'] }} (material {{ $donation['material_version'] }})</p>
    <p>Donor {{ $donation['donor_name'] }}</p>
    <p>Pledged total value PHP {{ $donation['pledged_total_value_php'] }} (valuation policy {{ $donation['valuation_policy']['policy_id'] }} v{{ $donation['valuation_policy']['version'] }})</p>
    @foreach ($donation['lines'] as $index => $line)
        @php($model = $lines[$index] ?? null)
        <section>
            <h2>{{ $index + 1 }}. {{ $model?->variant?->name ?? $model?->variant?->label ?? $line['variant_id'] }} ({{ $model?->variant?->code ?? $model?->variant?->sku ?? $line['variant_id'] }})</h2>
            <p>Pledged {{ $line['pledged_quantity'] }} {{ $model?->unit?->code ?? '' }} · Received {{ $line['received_quantity'] }} · Outstanding {{ $line['outstanding_quantity'] }}</p>
            <p>Valuation ({{ $line['valuation_kind'] }}): PHP {{ $line['unit_value_php'] }} / unit · Pledged PHP {{ $line['pledged_value_php'] }}</p>
            <p>Basis: {{ $line['valuation_basis'] }}</p>
            <p>Condition: {{ $line['condition_notes'] }}</p>
            <p>Restriction: {{ $line['restrictions']['state'] }}@if ($line['restrictions']['source_condition_reference']) · {{ $line['restrictions']['source_condition_reference'] }}@endif</p>
        </section>
    @endforeach
</body>
</html>
