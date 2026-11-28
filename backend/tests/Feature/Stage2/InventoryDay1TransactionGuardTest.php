<?php

namespace Tests\Feature\Stage2;

use App\Services\Inventory\Participants\PrepareReceivingInventoryParticipant;
use Illuminate\Support\Facades\DB;
use RuntimeException;
use Tests\TestCase;

class InventoryDay1TransactionGuardTest extends TestCase
{
    public function test_prepare_receiving_requires_caller_owned_outer_transaction(): void
    {
        $this->assertSame(0, DB::transactionLevel());

        $this->expectException(RuntimeException::class);
        $this->expectExceptionMessage('outer transaction');

        app(PrepareReceivingInventoryParticipant::class)->prepare([], []);
    }
}
