<?php

declare(strict_types=1);

use App\Modules\AccessChapterAdministration\InitialProviderAuthority;
use Illuminate\Contracts\Console\Kernel;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

// Synthetic fixture only. No live authorization, CLI claim, or production entrypoint.
if (getenv('YSP_SESSION_FIXTURES') !== '1') {
    fwrite(STDERR, "Synthetic officer fixture access denied.\n");
    exit(1);
}
require dirname(__DIR__, 2).'/vendor/autoload.php';
$app = require dirname(__DIR__, 2).'/bootstrap/app.php';
$app->make(Kernel::class)->bootstrap();
require __DIR__.'/fixture-support.php';
installFixtureFailureHandler();
$input = json_decode(stream_get_contents(STDIN), true, flags: JSON_THROW_ON_ERROR);
$mode = $argv[1] ?? '';
if (! in_array($mode, ['identity', 'provider'], true) || ! is_array($input)
    || ! is_string($input['email'] ?? null) || ! filter_var($input['email'], FILTER_VALIDATE_EMAIL)
    || ! is_string($input['password'] ?? null) || strlen($input['password']) < 12 || strlen($input['password']) > 72) {
    throw new InvalidArgumentException('Invalid synthetic officer setup.');
}
if (isset($input['id']) && (! is_string($input['id']) || ! preg_match('/^[1-9][0-9]{0,19}$/D', $input['id'])
    || (strlen($input['id']) === 20 && strcmp($input['id'], '18446744073709551615') > 0))) {
    throw new InvalidArgumentException('Invalid synthetic identity ID.');
}
$result = DB::transaction(function () use ($input, $mode): array {
    $values = ['public_id' => (string) Str::ulid(), 'name' => 'Synthetic fixture officer',
        'email' => $input['email'], 'email_key' => strtolower($input['email']),
        'password_hash' => password_hash($input['password'], PASSWORD_BCRYPT, ['cost' => 4]),
        'created_at' => now(), 'updated_at' => now()];
    if (isset($input['id'])) {
        $values['id'] = $input['id'];
    }
    $id = insertFixtureId('users', $values);
    DB::table('session_throttles')->delete();
    if ($mode === 'provider') {
        unset($values['id']);
        $values['public_id'] = (string) Str::ulid();
        $values['email'] = 'approver-'.bin2hex(random_bytes(10)).'@example.test';
        $values['email_key'] = $values['email'];
        $approver = insertFixtureId('users', $values);
        $organization = insertFixtureId('organizations', ['name' => 'Synthetic approved organization']);
        app(InitialProviderAuthority::class)->install($id, $organization, $approver,
            'Synthetic fixture operator', 'Synthetic independently approved test authorization');

        return ['id' => $id, 'organization' => $organization, 'approver' => $approver];
    }

    return ['id' => $id];
});
echo json_encode($result, JSON_THROW_ON_ERROR);
