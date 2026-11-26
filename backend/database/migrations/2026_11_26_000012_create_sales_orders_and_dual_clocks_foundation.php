<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** @var list<string> */
    private array $mutable = ['sale_stock_pools', 'sales_orders'];

    /** @var list<string> */
    private array $immutable = ['sales_invoices', 'so_funding_events', 'so_repf_forwards', 'so_late_payment_resolutions', 'sales_order_events'];

    public function up(): void
    {
        Schema::create('sale_stock_pools', function (Blueprint $t): void {
            $t->engine = 'InnoDB';
            $t->id();
            $t->unsignedBigInteger('chapter_id');
            $t->unsignedBigInteger('item_variant_id');
            $t->unsignedTinyInteger('unit_scale');
            $t->decimal('unit_price', 20, 2);
            $t->decimal('max_discount_amount', 20, 2);
            $t->decimal('so_unpaid_reserved_qty', 20, 6)->default(0);
            $t->decimal('so_paid_reserved_qty', 20, 6)->default(0);
            $t->unsignedInteger('row_version')->default(1);
            $t->timestamp('updated_at', 6);
            $t->unique(['chapter_id', 'id']);
            $t->unique(['chapter_id', 'item_variant_id']);
            $t->foreign('chapter_id')->references('id')->on('chapters');
            $t->foreign(['chapter_id', 'item_variant_id'], 'so_pool_iv_fk')->references(['chapter_id', 'id'])->on('item_variants');
        });
        DB::statement('ALTER TABLE sale_stock_pools ADD CONSTRAINT so_pool_chk CHECK (unit_price >= 0 AND max_discount_amount >= 0 AND so_unpaid_reserved_qty >= 0 AND so_paid_reserved_qty >= 0 AND unit_scale BETWEEN 0 AND 6 AND row_version >= 1)');

        Schema::create('sales_orders', function (Blueprint $t): void {
            $t->engine = 'InnoDB';
            $t->id();
            $t->unsignedBigInteger('chapter_id');
            $t->string('reference', 64)->charset('ascii')->collation('ascii_bin')->nullable();
            $t->unsignedBigInteger('sales_officer_user_id');
            $t->string('buyer_name', 160);
            $t->string('buyer_contact', 160);
            $t->unsignedBigInteger('item_variant_id');
            $t->unsignedTinyInteger('unit_scale');
            foreach (['ordered_qty' => 6, 'reserved_available_qty' => 6, 'paid_available_qty' => 6, 'backorder_shortage_qty' => 6, 'accepted_backorder_qty' => 6, 'declined_shortage_qty' => 6] as $col => $dec) {
                $t->decimal($col, 20, $dec)->default(0);
            }
            foreach (['unit_price', 'discount_amount', 'net_amount_due', 'estimated_procurement_cost', 'backorder_deposit_paid', 'partial_unfunded_credit'] as $col) {
                $t->decimal($col, 20, 2)->default(0);
            }
            $t->boolean('finance_cost_approved')->default(false);
            $t->string('payment_terms', 255);
            $t->timestamp('requested_at', 6);
            $t->string('fulfillment_arrangement', 16)->charset('ascii')->collation('ascii_bin');
            $t->timestamp('pickup_deadline_at', 6)->nullable();
            $t->string('status', 24)->charset('ascii')->collation('ascii_bin')->default('draft');
            $t->unsignedInteger('row_version')->default(1);
            $t->unsignedInteger('material_version')->default(1);
            $t->unsignedBigInteger('reviewer_user_id')->nullable();
            $t->string('reviewer_duty_code', 40)->charset('ascii')->collation('ascii_bin')->nullable();
            $t->unsignedInteger('approved_material_version')->nullable();
            $t->boolean('price_override_approved')->default(false);
            $t->timestamp('approved_at', 6)->nullable();
            $t->string('return_reason', 255)->nullable();
            $t->string('cancel_reason', 255)->nullable();
            $t->boolean('split_completed')->default(false);
            $t->boolean('can_procure_shortage')->default(false);
            $t->string('unpaid_available_state', 24)->charset('ascii')->collation('ascii_bin')->default('none');
            $t->string('backorder_state', 24)->charset('ascii')->collation('ascii_bin')->default('none');
            $t->timestamp('available_reservation_created_at', 6)->nullable();
            $t->timestamp('available_reservation_expires_at', 6)->nullable();
            $t->string('buyer_acceptance_decision', 32)->charset('ascii')->collation('ascii_bin')->nullable();
            $t->string('buyer_contact_channel', 32)->nullable();
            $t->string('buyer_contact_outcome', 32)->nullable();
            $t->timestamp('backorder_accepted_at', 6)->nullable();
            $t->timestamp('backorder_deposit_expires_at', 6)->nullable();
            $t->string('funded_or_reference', 80)->charset('ascii')->collation('ascii_bin')->nullable();
            $t->boolean('overdue_pickup_alert')->default(false);
            $t->boolean('payment_hold_expiry_notice')->default(false);
            $t->string('repf_reference', 64)->charset('ascii')->collation('ascii_bin')->nullable();
            $t->string('si_reference', 64)->charset('ascii')->collation('ascii_bin')->nullable();
            $t->timestamps(6);
            $t->unique(['chapter_id', 'id']);
            $t->unique(['chapter_id', 'reference']);
            $t->foreign('chapter_id')->references('id')->on('chapters');
            $t->foreign('sales_officer_user_id')->references('id')->on('users');
            $t->foreign('reviewer_user_id')->references('id')->on('users');
            $t->foreign(['chapter_id', 'item_variant_id'], 'so_iv_fk')->references(['chapter_id', 'id'])->on('item_variants');
        });
        DB::statement("ALTER TABLE sales_orders ADD CONSTRAINT so_bounds_chk CHECK (ordered_qty > 0 AND unit_price >= 0 AND discount_amount >= 0 AND net_amount_due >= 0 AND unit_scale BETWEEN 0 AND 6 AND row_version >= 1 AND material_version >= 1), ADD CONSTRAINT so_arr_chk CHECK (fulfillment_arrangement IN ('pickup','delivery')), ADD CONSTRAINT so_status_chk CHECK (status IN ('draft','pending_review','returned','approved','canceled')), ADD CONSTRAINT so_uavail_chk CHECK (unpaid_available_state IN ('none','active_unpaid','paid_protected','expired_released')), ADD CONSTRAINT so_bo_chk CHECK (backorder_state IN ('none','awaiting_deposit','funded_protected','lapsed_unfunded')), ADD CONSTRAINT so_bacc_chk CHECK (buyer_acceptance_decision IS NULL OR buyer_acceptance_decision IN ('accept_all','accept_available_only','decline_all'))");

        Schema::create('sales_invoices', function (Blueprint $t): void {
            $t->engine = 'InnoDB';
            $t->id();
            $t->unsignedBigInteger('chapter_id');
            $t->string('si_reference', 64)->charset('ascii')->collation('ascii_bin');
            $t->unsignedBigInteger('so_id');
            $t->unsignedInteger('so_material_version');
            $t->string('buyer_name', 160);
            $t->unsignedBigInteger('item_variant_id');
            $t->decimal('available_qty', 20, 6);
            $t->decimal('backordered_qty', 20, 6);
            $t->decimal('unit_price', 20, 2);
            $t->decimal('discount_amount', 20, 2);
            $t->decimal('net_amount_due', 20, 2);
            $t->unsignedBigInteger('issued_by_user_id');
            $t->timestamp('issued_at', 6);
            $t->unique(['chapter_id', 'so_id']);
            $t->unique(['chapter_id', 'si_reference']);
            $t->foreign('chapter_id')->references('id')->on('chapters');
            $t->foreign(['chapter_id', 'so_id'], 'si_so_fk')->references(['chapter_id', 'id'])->on('sales_orders');
            $t->foreign('issued_by_user_id')->references('id')->on('users');
        });
        DB::statement('ALTER TABLE sales_invoices ADD CONSTRAINT si_nonneg_chk CHECK (available_qty >= 0 AND backordered_qty >= 0 AND unit_price >= 0 AND discount_amount >= 0 AND net_amount_due >= 0)');

        Schema::create('so_funding_events', function (Blueprint $t): void {
            $t->engine = 'InnoDB';
            $t->id();
            $t->unsignedBigInteger('chapter_id');
            $t->unsignedBigInteger('so_id');
            $t->string('funding_scope', 24)->charset('ascii')->collation('ascii_bin');
            $t->string('or_reference', 80)->charset('ascii')->collation('ascii_bin');
            $t->decimal('amount', 20, 2);
            $t->unsignedBigInteger('actor_user_id');
            $t->timestamp('verified_at', 6);
            $t->foreign('chapter_id')->references('id')->on('chapters');
            $t->foreign(['chapter_id', 'so_id'], 'so_fund_so_fk')->references(['chapter_id', 'id'])->on('sales_orders');
            $t->foreign('actor_user_id')->references('id')->on('users');
        });
        DB::statement("ALTER TABLE so_funding_events ADD CONSTRAINT so_fund_chk CHECK (funding_scope IN ('backorder_deposit','available_reservation') AND amount > 0)");

        Schema::create('so_repf_forwards', function (Blueprint $t): void {
            $t->engine = 'InnoDB';
            $t->id();
            $t->unsignedBigInteger('chapter_id');
            $t->unsignedBigInteger('so_id');
            $t->string('repf_reference', 64)->charset('ascii')->collation('ascii_bin');
            $t->string('funded_or_reference', 80)->charset('ascii')->collation('ascii_bin');
            $t->decimal('quantity', 20, 6);
            $t->decimal('approved_cost', 20, 2);
            $t->unsignedBigInteger('forwarded_by_user_id');
            $t->timestamp('forwarded_at', 6);
            $t->unique(['chapter_id', 'so_id']);
            $t->foreign('chapter_id')->references('id')->on('chapters');
            $t->foreign(['chapter_id', 'so_id'], 'so_repf_so_fk')->references(['chapter_id', 'id'])->on('sales_orders');
            $t->foreign('forwarded_by_user_id')->references('id')->on('users');
        });
        DB::statement('ALTER TABLE so_repf_forwards ADD CONSTRAINT so_repf_pos_chk CHECK (quantity > 0 AND approved_cost >= 0)');

        Schema::create('so_late_payment_resolutions', function (Blueprint $t): void {
            $t->engine = 'InnoDB';
            $t->id();
            $t->unsignedBigInteger('chapter_id');
            $t->unsignedBigInteger('so_id');
            $t->string('or_reference', 80)->charset('ascii')->collation('ascii_bin');
            $t->decimal('requested_qty', 20, 6);
            $t->decimal('available_at_check', 20, 6);
            $t->string('outcome', 32)->charset('ascii')->collation('ascii_bin');
            $t->unsignedBigInteger('actor_user_id');
            $t->timestamp('resolved_at', 6);
            $t->foreign('chapter_id')->references('id')->on('chapters');
            $t->foreign(['chapter_id', 'so_id'], 'so_late_so_fk')->references(['chapter_id', 'id'])->on('sales_orders');
            $t->foreign('actor_user_id')->references('id')->on('users');
        });
        DB::statement("ALTER TABLE so_late_payment_resolutions ADD CONSTRAINT so_late_chk CHECK (requested_qty > 0 AND available_at_check >= 0 AND outcome IN ('allocated_fresh_paid','convert_to_funded_backorder','route_to_finance_refund'))");

        Schema::create('sales_order_events', function (Blueprint $t): void {
            $t->engine = 'InnoDB';
            $t->id();
            $t->unsignedBigInteger('chapter_id');
            $t->unsignedBigInteger('so_id');
            $t->unsignedInteger('row_version');
            $t->unsignedInteger('material_version');
            $t->string('action', 64)->charset('ascii')->collation('ascii_bin');
            $t->unsignedBigInteger('actor_user_id');
            $t->string('reason', 255)->nullable();
            $t->timestamp('occurred_at', 6);
            $t->index(['chapter_id', 'so_id', 'id'], 'so_events_idx');
            $t->foreign('chapter_id')->references('id')->on('chapters');
            $t->foreign(['chapter_id', 'so_id'], 'so_ev_so_fk')->references(['chapter_id', 'id'])->on('sales_orders');
            $t->foreign('actor_user_id')->references('id')->on('users');
        });

        $div = 'CASE v_scale WHEN 0 THEN 1000000 WHEN 1 THEN 100000 WHEN 2 THEN 10000 WHEN 3 THEN 1000 WHEN 4 THEN 100 WHEN 5 THEN 10 ELSE 1 END';
        foreach (['INSERT', 'UPDATE'] as $ev) {
            $suf = strtolower($ev);
            DB::unprepared(<<<SQL
                CREATE TRIGGER tr_so_clocks_{$suf} BEFORE {$ev} ON sales_orders FOR EACH ROW BEGIN
                    DECLARE v_scale TINYINT UNSIGNED;
                    DECLARE v_div BIGINT UNSIGNED;
                    SELECT u.quantity_scale INTO v_scale FROM item_variants iv JOIN items i ON i.id = iv.item_id JOIN units u ON u.id = i.base_unit_id WHERE iv.id = NEW.item_variant_id AND iv.chapter_id = NEW.chapter_id;
                    IF NEW.unit_scale <> v_scale THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'UNIT_SCALE_MISMATCH'; END IF;
                    SET v_div = ({$div});
                    IF MOD(CAST(NEW.ordered_qty * 1000000 AS DECIMAL(24,0)), v_div) <> 0 OR MOD(CAST(NEW.reserved_available_qty * 1000000 AS DECIMAL(24,0)), v_div) <> 0 OR MOD(CAST(NEW.paid_available_qty * 1000000 AS DECIMAL(24,0)), v_div) <> 0 OR MOD(CAST(NEW.backorder_shortage_qty * 1000000 AS DECIMAL(24,0)), v_div) <> 0 OR MOD(CAST(NEW.accepted_backorder_qty * 1000000 AS DECIMAL(24,0)), v_div) <> 0 OR MOD(CAST(NEW.declined_shortage_qty * 1000000 AS DECIMAL(24,0)), v_div) <> 0 THEN
                        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'UNIT_PRECISION_VIOLATION';
                    END IF;
                    IF NEW.available_reservation_expires_at IS NOT NULL AND (NEW.available_reservation_created_at IS NULL OR NEW.available_reservation_expires_at <> DATE_ADD(NEW.available_reservation_created_at, INTERVAL 48 HOUR)) THEN
                        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'SO_CLOCK1_INVALID: available_reservation_expires_at must equal created_at + 48 hours.';
                    END IF;
                    IF NEW.backorder_deposit_expires_at IS NOT NULL AND (NEW.backorder_accepted_at IS NULL OR NEW.backorder_deposit_expires_at <> DATE_ADD(NEW.backorder_accepted_at, INTERVAL 48 HOUR)) THEN
                        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'SO_CLOCK2_INVALID: backorder_deposit_expires_at must equal accepted_at + 48 hours.';
                    END IF;
                END
                SQL);
            DB::unprepared("CREATE TRIGGER tr_sale_stock_pools_scale_{$suf} BEFORE {$ev} ON sale_stock_pools FOR EACH ROW BEGIN DECLARE v_scale TINYINT UNSIGNED; DECLARE v_div BIGINT UNSIGNED; SELECT u.quantity_scale INTO v_scale FROM item_variants iv JOIN items i ON i.id = iv.item_id JOIN units u ON u.id = i.base_unit_id WHERE iv.id = NEW.item_variant_id AND iv.chapter_id = NEW.chapter_id; IF NEW.unit_scale <> v_scale THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'UNIT_SCALE_MISMATCH'; END IF; SET v_div = ({$div}); IF MOD(CAST(NEW.so_unpaid_reserved_qty * 1000000 AS DECIMAL(24,0)), v_div) <> 0 OR MOD(CAST(NEW.so_paid_reserved_qty * 1000000 AS DECIMAL(24,0)), v_div) <> 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'UNIT_PRECISION_VIOLATION'; END IF; END");
        }
        DB::unprepared("CREATE TRIGGER tr_sales_invoices_scale_insert BEFORE INSERT ON sales_invoices FOR EACH ROW BEGIN DECLARE v_scale TINYINT UNSIGNED; DECLARE v_div BIGINT UNSIGNED; SELECT unit_scale INTO v_scale FROM sales_orders WHERE id = NEW.so_id AND chapter_id = NEW.chapter_id; SET v_div = ({$div}); IF MOD(CAST(NEW.available_qty * 1000000 AS DECIMAL(24,0)), v_div) <> 0 OR MOD(CAST(NEW.backordered_qty * 1000000 AS DECIMAL(24,0)), v_div) <> 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'UNIT_PRECISION_VIOLATION'; END IF; END");
        DB::unprepared("CREATE TRIGGER tr_so_repf_forwards_scale_insert BEFORE INSERT ON so_repf_forwards FOR EACH ROW BEGIN DECLARE v_scale TINYINT UNSIGNED; SELECT unit_scale INTO v_scale FROM sales_orders WHERE id = NEW.so_id AND chapter_id = NEW.chapter_id; IF MOD(CAST(NEW.quantity * 1000000 AS DECIMAL(24,0)), ({$div})) <> 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'UNIT_PRECISION_VIOLATION'; END IF; END");
        DB::unprepared("CREATE TRIGGER tr_so_late_scale_insert BEFORE INSERT ON so_late_payment_resolutions FOR EACH ROW BEGIN DECLARE v_scale TINYINT UNSIGNED; DECLARE v_div BIGINT UNSIGNED; SELECT unit_scale INTO v_scale FROM sales_orders WHERE id = NEW.so_id AND chapter_id = NEW.chapter_id; SET v_div = ({$div}); IF MOD(CAST(NEW.requested_qty * 1000000 AS DECIMAL(24,0)), v_div) <> 0 OR MOD(CAST(NEW.available_at_check * 1000000 AS DECIMAL(24,0)), v_div) <> 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'UNIT_PRECISION_VIOLATION'; END IF; END");

        foreach ($this->immutable as $tbl) {
            foreach (['UPDATE', 'DELETE'] as $ev) {
                $act = strtolower($ev);
                DB::unprepared("CREATE TRIGGER tr_{$tbl}_no_{$act} BEFORE {$ev} ON {$tbl} FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'IMMUTABLE_RECORD: {$ev} forbidden on {$tbl}.'");
            }
        }

        $conn = DB::connection();
        $user = (string) config('database.runtime_username');
        $host = (string) config('database.runtime_host');
        $exists = DB::selectOne('SELECT EXISTS(SELECT 1 FROM mysql.user WHERE user = ? AND host = ?) AS found', [$user, $host]);
        if ($exists && (int) $exists->found === 1) {
            $pdo = $conn->getPdo();
            $account = $pdo->quote($user).'@'.$pdo->quote($host);
            $db = '`'.str_replace('`', '``', $conn->getDatabaseName()).'`';
            foreach ($this->mutable as $tbl) {
                DB::unprepared("GRANT UPDATE, DELETE ON {$db}.`{$tbl}` TO {$account}");
            }
        }
    }

    public function down(): void
    {
        foreach (['tr_so_clocks_insert', 'tr_so_clocks_update', 'tr_sale_stock_pools_scale_insert', 'tr_sale_stock_pools_scale_update', 'tr_sales_invoices_scale_insert', 'tr_so_repf_forwards_scale_insert', 'tr_so_late_scale_insert'] as $tr) {
            DB::unprepared("DROP TRIGGER IF EXISTS {$tr}");
        }
        foreach ($this->immutable as $tbl) {
            foreach (['update', 'delete'] as $act) {
                DB::unprepared("DROP TRIGGER IF EXISTS tr_{$tbl}_no_{$act}");
            }
        }
        foreach (array_reverse([...$this->mutable, ...$this->immutable]) as $tbl) {
            Schema::dropIfExists($tbl);
        }
    }
};
