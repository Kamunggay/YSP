<?php

declare(strict_types=1);

namespace Tests\Feature\Stage2;

use App\Models\CatalogueItem;
use App\Models\CatalogueLocation;
use App\Models\CatalogueUnit;
use App\Models\CatalogueVariant;
use App\Models\Chapter;
use App\Services\Inventory\Participants\OpenProcurementSupplyProvider;
use App\Services\Inventory\StockViewQueryService;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Verifies DatabaseOpenProcurementSupplyProvider line-level coverage_state preservation
 * (never collapsing counted + disputed/late/ineligible lines on the same document/variant)
 * and StockViewQueryService chapter-wide open PO inbound discovery before first receipt.
 */
class Stage2ADatabaseSupplyProviderTest extends TestCase
{
    private string $chapterId;

    private string $originalConnection;

    protected function setUp(): void
    {
        parent::setUp();

        $this->originalConnection = DB::getDefaultConnection();
        $database = getenv('YSP_SUPPLY_FIXTURE_DATABASE');
        $connection = $database === false
            ? ['driver' => 'sqlite', 'database' => ':memory:', 'foreign_key_constraints' => true]
            : array_replace(config('database.connections.mysql'), ['database' => $database, 'url' => null]);
        config(['database.connections.supply_fixture' => $connection]);
        DB::setDefaultConnection('supply_fixture');
        $this->assertSame(
            [],
            Schema::getTableListing($database === false ? null : $database),
            'Supply fixture connection must point to an empty disposable database.',
        );
        $this->assertSame(0, Artisan::call('migrate', ['--database' => 'supply_fixture', '--force' => true]));

        // The Leader procurement migration is not part of this integration base.
        Schema::create('repfs', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->uuid('chapter_id');
            $table->string('repf_reference', 80);
            $table->string('status', 40);
            $table->boolean('linked_demand_canceled')->default(false);
        });
        Schema::create('repf_lines', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->uuid('repf_id');
            $table->uuid('variant_id');
            $table->uuid('unit_id');
            $table->decimal('remaining_to_order_quantity', 18, 6);
            $table->boolean('linked_demand_canceled')->default(false);
            $table->string('needed_by', 20)->nullable();
        });
        Schema::create('purchase_orders', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->uuid('chapter_id');
            $table->string('po_reference', 80);
            $table->string('status', 40);
            $table->string('expected_delivery_date', 20)->nullable();
            $table->string('revised_expected_delivery_date', 20)->nullable();
            $table->boolean('linked_demand_canceled')->default(false);
        });
        Schema::create('purchase_order_lines', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->uuid('po_id');
            $table->uuid('variant_id');
            $table->uuid('unit_id');
            $table->decimal('outstanding_quantity', 18, 6);
            $table->boolean('linked_demand_canceled')->default(false);
        });
        Schema::create('receiving_discrepancies', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->uuid('chapter_id');
            $table->string('source_kind', 20);
            $table->uuid('source_line_id');
            $table->string('status', 40);
        });
    }

    protected function tearDown(): void
    {
        DB::purge('supply_fixture');
        DB::setDefaultConnection($this->originalConnection);
        parent::tearDown();
    }

    public function test_preserves_mixed_line_coverage_states_and_reports_chapter_inbound_before_first_receipt(): void
    {
        $this->chapterId = (string) Str::uuid();
        $unitId = (string) Str::uuid();
        $itemId = (string) Str::uuid();
        $variantAId = (string) Str::uuid();
        $variantBId = (string) Str::uuid();
        $locId = (string) Str::uuid();

        Chapter::create([
            'id' => $this->chapterId,
            'code' => 'CEB-DB-'.substr(str_replace('-', '', $this->chapterId), 0, 6),
            'name' => 'DB Supply Test Chapter',
            'status' => 'live',
            'version' => 1,
        ]);
        CatalogueLocation::create([
            'id' => $locId,
            'chapter_id' => $this->chapterId,
            'code' => 'WH-1',
            'name' => 'Main Room',
            'kind' => 'stockroom',
            'is_active' => true,
            'state' => 'active',
            'material_version' => 1,
        ]);
        CatalogueUnit::create([
            'id' => $unitId,
            'chapter_id' => $this->chapterId,
            'code' => 'PCS',
            'name' => 'Pieces',
            'quantity_kind' => 'piece',
            'quantity_scale' => 0,
            'quantity_identity_locked' => true,
            'state' => 'active',
            'material_version' => 1,
        ]);
        CatalogueItem::create([
            'id' => $itemId,
            'chapter_id' => $this->chapterId,
            'code' => 'TENT',
            'name' => 'Family Tent',
            'unit_id' => $unitId,
            'material_version' => 1,
            'is_active' => true,
            'state' => 'active',
        ]);
        foreach ([[$variantAId, 'TENT-L'], [$variantBId, 'TENT-XL']] as [$vId, $code]) {
            CatalogueVariant::create([
                'id' => $vId,
                'chapter_id' => $this->chapterId,
                'item_id' => $itemId,
                'code' => $code,
                'sku' => $code,
                'name' => $code,
                'label' => $code,
                'unit_id' => $unitId,
                'quantity_scale' => 0,
                'quantity_identity_locked' => true,
                'material_version' => 1,
                'is_active' => true,
                'state' => 'active',
            ]);
        }

        $today = now('UTC')->toDateString();
        $future = now('UTC')->addDays(5)->toDateString();
        $past = now('UTC')->subDays(2)->toDateString();

        // Same RepF & variant: line 1 on time (counted 15) + line 2 past needed_by (late 5)
        $repfId = (string) Str::uuid();
        DB::table('repfs')->insert([
            'id' => $repfId,
            'chapter_id' => $this->chapterId,
            'repf_reference' => 'CEB-REPF-MIX-01',
            'status' => 'approved',
            'linked_demand_canceled' => false,
        ]);
        DB::table('repf_lines')->insert([
            [
                'id' => (string) Str::uuid(),
                'repf_id' => $repfId,
                'variant_id' => $variantAId,
                'unit_id' => $unitId,
                'remaining_to_order_quantity' => 15,
                'linked_demand_canceled' => false,
                'needed_by' => $future,
            ],
            [
                'id' => (string) Str::uuid(),
                'repf_id' => $repfId,
                'variant_id' => $variantAId,
                'unit_id' => $unitId,
                'remaining_to_order_quantity' => 5,
                'linked_demand_canceled' => false,
                'needed_by' => $past,
            ],
        ]);

        // Same PO & variant: line 1 counted (40) + line 2 disputed (10)
        $poMixedId = (string) Str::uuid();
        $poCountedLineId = (string) Str::uuid();
        $poDisputedLineId = (string) Str::uuid();
        DB::table('purchase_orders')->insert([
            'id' => $poMixedId,
            'chapter_id' => $this->chapterId,
            'po_reference' => 'CEB-PO-MIX-01',
            'status' => 'partially_received',
            'expected_delivery_date' => $future,
            'revised_expected_delivery_date' => null,
            'linked_demand_canceled' => false,
        ]);
        DB::table('purchase_order_lines')->insert([
            [
                'id' => $poCountedLineId,
                'po_id' => $poMixedId,
                'variant_id' => $variantAId,
                'unit_id' => $unitId,
                'outstanding_quantity' => 40,
                'linked_demand_canceled' => false,
            ],
            [
                'id' => $poDisputedLineId,
                'po_id' => $poMixedId,
                'variant_id' => $variantAId,
                'unit_id' => $unitId,
                'outstanding_quantity' => 10,
                'linked_demand_canceled' => false,
            ],
        ]);
        DB::table('receiving_discrepancies')->insert([
            'id' => (string) Str::uuid(),
            'chapter_id' => $this->chapterId,
            'source_kind' => 'po',
            'source_line_id' => $poDisputedLineId,
            'status' => 'open',
        ]);

        // Issued PO for variant B which has ZERO physical inventory_lots
        $poUnreceivedId = (string) Str::uuid();
        DB::table('purchase_orders')->insert([
            'id' => $poUnreceivedId,
            'chapter_id' => $this->chapterId,
            'po_reference' => 'CEB-PO-NEW-02',
            'status' => 'issued',
            'expected_delivery_date' => $future,
            'revised_expected_delivery_date' => null,
            'linked_demand_canceled' => false,
        ]);
        DB::table('purchase_order_lines')->insert([
            'id' => (string) Str::uuid(),
            'po_id' => $poUnreceivedId,
            'variant_id' => $variantBId,
            'unit_id' => $unitId,
            'outstanding_quantity' => 100,
            'linked_demand_canceled' => false,
        ]);

        /** @var OpenProcurementSupplyProvider $provider */
        $provider = $this->app->make(OpenProcurementSupplyProvider::class);
        $sources = $provider->getInboundSourcesForVariants(
            $this->chapterId,
            [$variantAId, $variantBId],
            null,
            $today.'T10:00:00.000000Z'
        );

        $countedRepf = collect($sources)->first(fn ($s) => $s['source_kind'] === 'repf' && $s['coverage_state'] === 'counted');
        $lateRepf = collect($sources)->first(fn ($s) => $s['source_kind'] === 'repf' && $s['coverage_state'] === 'late');
        $countedPo = collect($sources)->first(fn ($s) => $s['source_id'] === $poMixedId && $s['coverage_state'] === 'counted');
        $disputedPo = collect($sources)->first(fn ($s) => $s['source_id'] === $poMixedId && $s['coverage_state'] === 'disputed');

        $this->assertNotNull($countedRepf);
        $this->assertSame('15.000000', $countedRepf['open_quantity']);
        $this->assertNotNull($lateRepf);
        $this->assertSame('5.000000', $lateRepf['open_quantity']);
        $this->assertNotNull($countedPo);
        $this->assertSame('40.000000', $countedPo['open_quantity']);
        $this->assertNotNull($disputedPo);
        $this->assertSame('10.000000', $disputedPo['open_quantity']);

        // Chapter-wide StockViewQueryService must report ALL open PO inbound (40 + 10 + 100 = 150) even with ZERO physical lots!
        /** @var StockViewQueryService $stockViews */
        $stockViews = $this->app->make(StockViewQueryService::class);
        $chapterMetrics = $stockViews->getRawMetrics($this->chapterId, null);
        $this->assertSame('150.000000', $chapterMetrics['inbound_open_po_str']);
        $this->assertSame('0.000000', $chapterMetrics['usable_on_hand_str']);

        $withoutRepf = $provider->getInboundSourcesForVariants($this->chapterId, [$variantAId], excludeRepfId: $repfId);
        $this->assertFalse(collect($withoutRepf)->contains('source_kind', 'repf'));

        if (DB::getDriverName() === 'mysql') {
            $readOpenPo = fn () => collect($provider->getInboundSourcesForVariants(
                $this->chapterId, [$variantAId], lock: false,
            ))->first(fn (array $source) => $source['source_id'] === $poMixedId && $source['coverage_state'] === 'counted')['open_quantity'];

            $writer = DB::build(config('database.connections.supply_fixture'));
            try {
                DB::transaction(function () use ($writer, $readOpenPo, $poCountedLineId): void {
                    // Establish the caller's inventory read view before the receipt reduces outstanding supply.
                    DB::table('inventory_lots')->count();
                    $writer->table('purchase_order_lines')->where('id', $poCountedLineId)->update(['outstanding_quantity' => 30]);
                    $this->assertSame('40.000000', $readOpenPo());
                });
                $this->assertSame('30.000000', $readOpenPo());
            } finally {
                $writer->disconnect();
            }
        }

    }
}
