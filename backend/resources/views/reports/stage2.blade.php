<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>{{ ucfirst($metadata['report_kind']) }} report</title>
    <style>
        body { font: 12pt system-ui, sans-serif; margin: 2rem; }
        h2 { margin-top: 2rem; }
        dl { display: grid; grid-template-columns: max-content 1fr; gap: .2rem 1rem; break-inside: avoid; }
        dd { margin: 0; overflow-wrap: anywhere; }
    </style>
</head>
<body>
<h1>{{ ucfirst($metadata['report_kind']) }} report</h1>
<p>{{ $metadata['chapter_name'] }} ({{ $metadata['chapter_id'] }})</p>
<p>{{ $metadata['filters']['date_from'] }} to {{ $metadata['filters']['date_to'] }} (Asia/Manila) · {{ $metadata['currency_label'] }}</p>
<p>Generated at {{ $metadata['generated_at'] }} (server time, UTC)</p>
@if (isset($labels['stock_category_labels']))
    <p>Stock categories overlap. Do not add them together.</p>
    <p>{{ implode(' · ', array_filter($labels['stock_category_labels'], 'is_string')) }}</p>
@endif
<h2>Totals</h2>
<dl>
    @foreach ($totals as $field => $value)
        <dt>{{ ucfirst(str_replace('_', ' ', $field)) }}</dt><dd>{{ $value }}</dd>
    @endforeach
</dl>
@foreach ($sections as $section => $rows)
    <h2>{{ $section === 'data' ? 'Stock balances' : ucfirst(str_replace('_', ' ', $section)) }}</h2>
    @forelse ($rows as $row)
        <dl>
            @foreach ($row as $field => $value)
                <dt>{{ ucfirst(str_replace('_', ' ', $field)) }}</dt>
                <dd>{{ is_array($value) ? json_encode($value, JSON_UNESCAPED_UNICODE) : (is_bool($value) ? ($value ? 'Yes' : 'No') : ($value ?? '—')) }}</dd>
            @endforeach
        </dl>
    @empty
        <p>No matching records.</p>
    @endforelse
@endforeach
</body>
</html>
