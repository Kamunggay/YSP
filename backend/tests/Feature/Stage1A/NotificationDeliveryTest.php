<?php

namespace Tests\Feature\Stage1A;

use App\Models\AuditLog;
use App\Models\Chapter;
use App\Models\DomainNotificationOutbox;
use App\Models\OpeningCount;
use App\Models\OpeningRm;
use App\Models\User;
use App\Services\Authority\ControlledSetup;
use App\Services\Notifications\DomainNotificationOutboxService;
use App\Services\Shared\CanonicalJson;
use Illuminate\Foundation\Testing\DatabaseTruncation;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use OTPHP\TOTP;
use Ratchet\RFC6455\Messaging\Frame;
use Tests\TestCase;

class NotificationDeliveryTest extends TestCase
{
    use DatabaseTruncation;

    private const PASSWORD = 'synthetic notification password';

    private string $gateway;

    private string $origin;

    protected function setUp(): void
    {
        if (! getenv('NOTIFICATION_TEST_GATEWAY')) {
            $this->markTestSkipped('Requires the isolated gateway, Reverb and MySQL test services.');
        }
        parent::setUp();
        $this->gateway = rtrim(getenv('NOTIFICATION_TEST_GATEWAY'), '/');
        $this->origin = rtrim(config('app.url'), '/');
    }

    public function test_committed_evidence_delivery_retries_and_fences_revoked_connections(): void
    {
        $chapter = Chapter::create(['code' => 'SYN-WS', 'name' => 'Synthetic notification chapter']);
        $foreign = Chapter::create(['code' => 'SYN-OTHER', 'name' => 'Foreign chapter']);
        $writer = $this->officer($chapter, 'RECEIVING');
        $reader = $this->officer($chapter, 'RECEIVING');
        $member = $this->officer($chapter);
        $members = $this->signIn($member);
        $readerCookies = $this->signIn($reader);
        $otherBrowser = $this->signIn($reader);
        $writerCookies = $this->signIn($writer);
        [$readerSocket, $readerId] = $this->connect($readerCookies);
        [$memberSocket, $memberId] = $this->connect($members);

        $chapterChannel = "private-stage1.chapter.{$chapter->id}.user.{$reader->id}";
        $selfChannel = "private-stage1.user.{$reader->id}";
        $memberChannel = "private-stage1.chapter.{$chapter->id}.user.{$member->id}";
        $path = "/api/v1/chapters/{$chapter->id}/notification-subscriptions/authorize";
        $body = ['socket_id' => $readerId, 'channel_name' => $chapterChannel];

        $this->assertSame(403, $this->authorize($path, $body, $otherBrowser)->status());
        $this->assertSame('notification_subscription_denied', $this->authorize($path, $body, $otherBrowser)->json('error.code'));
        $this->assertSame('origin_denied', $this->authorize($path, $body, $readerCookies, ['Origin' => 'https://other.invalid'])->json('error.code'));
        $this->assertSame(419, $this->authorize($path, $body, $readerCookies, ['X-XSRF-TOKEN' => 'wrong'])->status());
        $this->assertSame('malformed_request', $this->authorize($path.'?scope=foreign', $body, $readerCookies)->json('error.code'));
        $this->assertSame('invalid_selector', $this->authorize('/api/v1/chapters/not-a-uuid/notification-subscriptions/authorize', $body, $readerCookies)->json('error.code'));
        $this->assertSame(422, $this->authorize($path, $body + ['scope' => 'extra'], $readerCookies)->status());
        $this->assertSame(403, $this->authorize("/api/v1/chapters/{$foreign->id}/notification-subscriptions/authorize", [
            'socket_id' => $readerId, 'channel_name' => "private-stage1.chapter.{$foreign->id}.user.{$reader->id}",
        ], $readerCookies)->status());

        $auth = $this->subscribe($readerSocket, $path, $body, $readerCookies);
        $this->assertSame($auth, $this->authorize($path, $body, $readerCookies)->json());
        [$otherSocket] = $this->connect($otherBrowser);
        $this->send($otherSocket, 'pusher:subscribe', ['channel' => $chapterChannel, ...$auth]);
        $this->assertSame('pusher:error', $this->receive($otherSocket)['event']);
        fclose($otherSocket);
        $this->subscribe($readerSocket, '/api/v1/auth/notification-subscriptions/authorize', [
            'socket_id' => $readerId, 'channel_name' => $selfChannel,
        ], $readerCookies);
        $this->subscribe($memberSocket, $path, ['socket_id' => $memberId, 'channel_name' => $memberChannel], $members);
        $this->send($memberSocket, 'pusher:subscribe', ['channel' => $chapterChannel, ...$auth]);
        $this->assertSame('pusher:subscription_error', $this->receive($memberSocket)['event']);

        $ipc = OpeningCount::create(['chapter_id' => $chapter->id, 'created_by' => $writer->id]);
        $rm = OpeningRm::create(['chapter_id' => $chapter->id, 'ipc_id' => $ipc->id]);
        $key = (string) Str::uuid();
        $uploaded = $this->upload($chapter, $rm, $writerCookies, $key);
        $this->assertSame(201, $uploaded->status(), $uploaded->body());
        $id = $uploaded->json('data.evidence_id');
        $event = DomainNotificationOutbox::where('resource_id', $id)->sole();
        $this->assertSame('pending', $event->status);
        $this->assertQuiet($readerSocket);
        $this->assertSame('true', $this->upload($chapter, $rm, $writerCookies, $key)->header('X-Action-Replayed'));
        $this->assertDatabaseCount('domain_notification_outbox', 1);

        $broker = config('notifications.broker_url');
        config(['notifications.broker_url' => 'http://127.0.0.1:1']);
        $this->assertSame(1, Artisan::call('notifications:dispatch', ['--once' => true]));
        $this->assertSame('pending', $event->refresh()->status);
        $this->assertSame(200, $this->http($writerCookies)->get("/api/v1/chapters/{$chapter->id}/evidence/{$id}")->status());
        config(['notifications.broker_url' => $broker]);
        $this->assertSame(0, Artisan::call('notifications:dispatch', ['--once' => true]));
        $wire = $this->receive($readerSocket);
        $this->assertSame('stage1.paper-evidence.changed.v1', $wire['event']);
        $this->assertSame($chapterChannel, $wire['channel']);
        $this->assertEquals([
            'event_id' => $event->id, 'event_name' => 'stage1.paper-evidence.changed.v1', 'chapter_id' => $chapter->id,
            'resource_kind' => 'paper_evidence', 'resource_id' => $id, 'resource_version' => 1,
            'material_version' => null, 'committed_at' => $event->payload_json['committed_at'],
        ], json_decode($wire['data'], true, flags: JSON_THROW_ON_ERROR));
        $this->assertSame('dispatched', $event->refresh()->status);
        $this->assertSame(2, (int) $event->attempts);
        $this->assertQuiet($memberSocket);
        $this->assertSame(0, Artisan::call('notifications:dispatch', ['--once' => true]));
        $this->assertQuiet($readerSocket);

        DB::beginTransaction();
        $rollback = app(DomainNotificationOutboxService::class)->recordIntent('stage1.paper-evidence.changed.v1', $chapter->id, $id, 1);
        DB::rollBack();
        $this->assertDatabaseMissing('domain_notification_outbox', ['id' => $rollback->id]);

        $this->revokeMembership($chapter, $reader);
        $new = $this->upload($chapter, $rm, $writerCookies, (string) Str::uuid());
        $this->assertSame(201, $new->status(), $new->body());
        $this->assertSame(0, Artisan::call('notifications:dispatch', ['--once' => true]));
        $authority = $this->receive($readerSocket);
        $this->assertSame('stage1.authority.changed.v1', $authority['event']);
        $this->assertSame($selfChannel, $authority['channel']);
        $this->assertQuiet($readerSocket);
        $this->assertSame(403, $this->authorize($path, $body, $readerCookies)->status());
        $this->assertSame(404, $this->http($readerCookies)->get("/api/v1/chapters/{$chapter->id}/evidence/{$id}")->status());

        $signOut = $this->http($readerCookies, ['X-Action-Key' => (string) Str::uuid()])->send('POST', '/api/v1/auth/sign-out');
        $this->assertSame(204, $signOut->status(), $signOut->body());
        stream_set_timeout($readerSocket, 7);
        $this->assertNull($this->receive($readerSocket));
        $this->assertFalse(stream_get_meta_data($readerSocket)['timed_out']);
        fclose($readerSocket);
        fclose($memberSocket);

        for ($attempt = 0; $attempt <= 60; $attempt++) {
            $throttled = $this->authorize($path, ['socket_id' => '999.999', 'channel_name' => $memberChannel], $members);
            if ($throttled->status() === 429) {
                break;
            }
            $this->assertSame(403, $throttled->status());
        }
        $this->assertSame(429, $throttled->status());
        $this->assertSame('throttled', $throttled->json('error.code'));
        $this->assertGreaterThan(0, (int) $throttled->header('Retry-After'));
    }

    private function revokeMembership(Chapter $chapter, User $reader): void
    {
        $operator = $this->officer($chapter);
        $head = $this->officer($chapter, 'CHAPTER_HEAD');
        foreach ([$operator, $head] as $user) {
            $user->mfaCredential()->create(['secret' => '', 'encrypted_seed' => TOTP::generate()->getSecret(), 'is_confirmed' => true]);
        }
        DB::table('chapter_setup_entitlements')->insert([
            'user_id' => $operator->id, 'chapter_id' => $chapter->id, 'procedure_id' => 'setMembership', 'starts_at' => now(),
        ]);
        $cookie = $this->signIn($operator, $operator->mfaCredential()->sole()->encrypted_seed);
        $intent = [
            'procedure_id' => 'setMembership', 'operator_id' => $operator->id, 'chapter_id' => $chapter->id,
            'target_id' => $reader->memberships()->sole()->id, 'expected_version' => 1, 'reason' => 'Synthetic revocation',
            'input' => ['user_id' => $reader->id, 'status' => 'revoked', 'effective_from' => now()->toISOString()],
        ];
        $approval = [
            'id' => (string) Str::uuid(), 'approver_id' => $head->id, 'authority' => 'CHAPTER_HEAD',
            'approved_at' => now()->toISOString(), 'evidence_reference' => 'decision:synthetic-revoke',
        ];
        AuditLog::create([
            'id' => $approval['id'], 'chapter_id' => $chapter->id, 'user_id' => $head->id, 'action' => 'setup:approval',
            'entity_type' => 'setMembership', 'entity_id' => $intent['target_id'],
            'details' => ['approval' => $approval, 'intent_sha256' => CanonicalJson::sha256($intent)],
        ]);
        $result = app(ControlledSetup::class)->execute('setMembership', json_decode(json_encode($intent + [
            'action_key' => (string) Str::uuid(), 'approvals' => [$approval],
        ], JSON_THROW_ON_ERROR), flags: JSON_THROW_ON_ERROR), $cookie['ysp_session']);
        $this->assertSame('committed', $result['outcome'], $result['code'] ?? '');
    }

    private function upload(Chapter $chapter, OpeningRm $rm, array $cookies, string $key): Response
    {
        ob_start();
        imagepng(imagecreatetruecolor(2, 2));
        $image = ob_get_clean();

        return $this->http($cookies, ['X-Action-Key' => $key])
            ->attach('attachments', $image, 'receipt.png', ['Content-Type' => 'image/png'])
            ->post("/api/v1/chapters/{$chapter->id}/evidence", ['purpose' => 'opening_receipt', 'record_id' => $rm->id]);
    }

    private function authorize(string $path, array $payload, array $cookies, array $headers = []): Response
    {
        return $this->http($cookies, $headers)->post($path, $payload);
    }

    private function subscribe($socket, string $path, array $body, array $cookies): array
    {
        $response = $this->authorize($path, $body, $cookies);
        $this->assertSame(200, $response->status(), $response->body());
        $this->assertSame('no-store', $response->header('Cache-Control'));
        $signature = $response->json();
        $this->assertSame(['auth'], array_keys($signature));
        $this->send($socket, 'pusher:subscribe', ['channel' => $body['channel_name'], ...$signature]);
        $this->assertSame('pusher_internal:subscription_succeeded', $this->receive($socket)['event']);

        return $signature;
    }

    private function signIn(User $user, ?string $seed = null): array
    {
        $anonymous = $this->http()->get('/api/v1/auth/csrf');
        $this->assertSame(204, $anonymous->status(), $anonymous->body());
        $signed = $this->http($this->cookies($anonymous), ['X-Action-Key' => (string) Str::uuid()])
            ->post('/api/v1/auth/sign-in', ['login' => $user->email, 'password' => self::PASSWORD]);
        $this->assertSame(200, $signed->status(), $signed->body());
        if ($seed) {
            $signed = $this->http($this->cookies($signed), ['X-Action-Key' => (string) Str::uuid()])
                ->post('/api/v1/auth/authenticator/challenge', ['authenticator_code' => TOTP::createFromSecret($seed)->now()]);
            $this->assertSame(200, $signed->status(), $signed->body());
        }

        return $this->cookies($signed);
    }

    private function cookies(Response $response): array
    {
        $result = [];
        foreach ($response->toPsrResponse()->getHeader('Set-Cookie') as $header) {
            [$name, $value] = explode('=', explode(';', $header, 2)[0], 2);
            $result[$name] = rawurldecode($value);
        }

        return $result;
    }

    private function http(array $cookies = [], array $headers = []): PendingRequest
    {
        $header = $headers + [
            'Host' => $this->authority(), 'Origin' => $this->origin, 'Sec-Fetch-Site' => 'same-origin',
            'X-XSRF-TOKEN' => $cookies['XSRF-TOKEN'] ?? '',
        ];
        if ($cookies !== []) {
            $header['Cookie'] = 'ysp_session='.$cookies['ysp_session'].'; XSRF-TOKEN='.$cookies['XSRF-TOKEN'];
        }

        return Http::baseUrl($this->gateway)->withOptions(['verify' => false])->timeout(10)->acceptJson()->withHeaders($header);
    }

    private function authority(): string
    {
        return substr($this->origin, strpos($this->origin, '://') + 3);
    }

    private function connect(array $cookies): array
    {
        $secure = str_starts_with($this->gateway, 'https://');
        $host = parse_url($this->gateway, PHP_URL_HOST);
        $port = parse_url($this->gateway, PHP_URL_PORT) ?: ($secure ? 443 : 80);
        $socket = stream_socket_client(($secure ? 'tls://' : 'tcp://')."{$host}:{$port}", timeout: 4,
            context: stream_context_create(['ssl' => ['verify_peer' => false, 'verify_peer_name' => false]]));
        $this->assertIsResource($socket);
        stream_set_timeout($socket, 4);
        $key = base64_encode(random_bytes(16));
        $app = config('notifications.app_key');
        fwrite($socket, "GET /app/{$app}?protocol=7 HTTP/1.1\r\nHost: ".$this->authority()
            ."\r\nOrigin: {$this->origin}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\n"
            ."Sec-WebSocket-Key: {$key}\r\nCookie: ysp_session={$cookies['ysp_session']}\r\n\r\n");
        $this->assertStringContainsString('101', fgets($socket));
        while (($line = fgets($socket)) !== false && $line !== "\r\n") {
        }
        $established = $this->receive($socket);
        $this->assertSame('pusher:connection_established', $established['event']);

        return [$socket, json_decode($established['data'], true, flags: JSON_THROW_ON_ERROR)['socket_id']];
    }

    private function send($socket, string $event, array $data): void
    {
        fwrite($socket, (new Frame(json_encode(['event' => $event, 'data' => $data], JSON_THROW_ON_ERROR)))->maskPayload()->getContents());
    }

    private function receive($socket): ?array
    {
        $header = stream_get_contents($socket, 2);
        if (! $header || strlen($header) !== 2 || (ord($header[0]) & 0xF) === 8) {
            return null;
        }

        $length = ord($header[1]) & 0x7F;
        if ($length === 126) {
            $length = unpack('n', stream_get_contents($socket, 2))[1];
        }

        return json_decode(stream_get_contents($socket, $length), true, flags: JSON_THROW_ON_ERROR);
    }

    private function assertQuiet($socket): void
    {
        $read = [$socket];
        $write = $except = [];
        $this->assertSame(0, stream_select($read, $write, $except, 0, 250000));
    }

    private function officer(Chapter $chapter, ?string $duty = null): User
    {
        $user = User::create([
            'name' => 'Synthetic officer', 'public_id' => (string) Str::uuid(),
            'email' => Str::uuid().'@example.invalid', 'password_hash' => Hash::make(self::PASSWORD),
        ]);
        $user->memberships()->create(['chapter_id' => $chapter->id]);
        if ($duty) {
            $user->dutyGrants()->create(['chapter_id' => $chapter->id, 'duty_code' => $duty]);
        }

        return $user;
    }
}
