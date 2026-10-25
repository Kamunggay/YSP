<?php

// Contract encoder cross-check only; this does not select the application runtime.
$vectors = json_decode(
    file_get_contents(__DIR__.'/../../identity-record-evidence/v1/canonical-vectors.json'),
    false,
    512,
    JSON_THROW_ON_ERROR,
);
$flags = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_LINE_TERMINATORS | JSON_THROW_ON_ERROR;
foreach ($vectors->valid as $vector) {
    $canonical = json_encode($vector->value, $flags);
    if ($canonical !== $vector->canonical_json || hash('sha256', $canonical) !== $vector->sha256) {
        throw new RuntimeException('Canonical bytes/hash mismatch: '.$vector->name);
    }
}
foreach ($vectors->invalid as $vector) {
    try {
        json_decode($vector->input_json, false, 512, JSON_THROW_ON_ERROR);
    } catch (JsonException $error) {
        if ($error->getCode() === JSON_ERROR_UTF16) {
            continue;
        }
        throw $error;
    }
    throw new RuntimeException('Invalid Unicode accepted: '.$vector->name);
}
echo count($vectors->valid).' canonical byte/hash vectors and '.count($vectors->invalid)." invalid Unicode vectors pass.\n";
