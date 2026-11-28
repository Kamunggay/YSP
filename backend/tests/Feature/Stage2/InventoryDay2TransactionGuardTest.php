<?php

namespace Tests\Feature\Stage2;

use App\Services\Inventory\Participants\ApplyLotRestrictionResolutionParticipant;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Tests\TestCase;

class InventoryDay2TransactionGuardTest extends TestCase
{
    public function test_apply_lot_restriction_resolution_requires_caller_owned_outer_transaction(): void
    {
        $this->assertSame(0, DB::transactionLevel());

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('outer transaction');

        app(ApplyLotRestrictionResolutionParticipant::class)->apply([]);
    }
}
