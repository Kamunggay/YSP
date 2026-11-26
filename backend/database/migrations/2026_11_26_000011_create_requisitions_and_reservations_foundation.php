<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** @var list<string> */
    private array $mutable = ['requisitions', 'requisition_lines', 'rf_reservation_preparations', 'rf_reservations', 'rf_reservation_cells'];

    /** @var list<string> */
    private array $immutable = ['requisition_events', 'rf_reservation_events'];

    public function up(): void
    {
        Schema::create('requisitions', function (Blueprint $t): void {
            $t->engine = 'InnoDB';
            $t->id();
            $t->unsignedBigInteger('chapter_id');
            $t->string('reference', 64)->charset('ascii')->collation('ascii_bin')->nullable();
            $t->unsignedBigInteger('requesting_unit_id')->nullable();
            $t->unsignedBigInteger('requester_user_id');
            $t->string('purpose_kind', 16)->charset('ascii')->collation('ascii_bin')->default('internal');
            $t->timestamp('needed_at', 6)->nullable();
            $t->text('justification')->nullable();
            $t->string('status', 24)->charset('ascii')->collation('ascii_bin')->default('draft');
            $t->string('fulfillment_state', 24)->charset('ascii')->collation('ascii_bin')->default('unissued');
            $t->unsignedInteger('row_version')->default(1);
            $t->unsignedInteger('material_version')->default(1);
            $t->unsignedInteger('progress_version')->default(1);
            $t->string('return_reason', 255)->nullable();
            $t->string('cancel_reason', 255)->nullable();
            $t->timestamp('submitted_at', 6)->nullable();
            $t->unsignedBigInteger('approved_by_user_id')->nullable();
            $t->string('approved_duty_code', 40)->charset('ascii')->collation('ascii_bin')->nullable();
            $t->unsignedInteger('approved_material_version')->nullable();
            $t->timestamp('approved_at', 6)->nullable();
            $t->timestamps(6);
            $t->unique(['chapter_id', 'id']);
            $t->unique(['chapter_id', 'reference']);
            $t->foreign('chapter_id')->references('id')->on('chapters');
            $t->foreign('requester_user_id')->references('id')->on('users');
            $t->foreign('approved_by_user_id')->references('id')->on('users');
            $t->foreign(['chapter_id', 'requesting_unit_id'], 'req_unit_fk')->references(['chapter_id', 'id'])->on('requesting_units');
        });
        DB::statement("ALTER TABLE requisitions ADD CONSTRAINT requisitions_vers_chk CHECK (row_version >= 1 AND material_version >= 1 AND progress_version >= 1), ADD CONSTRAINT req_purpose_chk CHECK (purpose_kind IN ('internal','booth')), ADD CONSTRAINT req_status_chk CHECK (status IN ('draft','submitted','returned','approved','canceled')), ADD CONSTRAINT req_fulfill_chk CHECK (fulfillment_state IN ('unissued','partially_reserved','fully_reserved','partial','complete'))");

        Schema::create('requisition_lines', function (Blueprint $t): void {
            $t->engine = 'InnoDB';
            $t->id();
            $t->unsignedBigInteger('chapter_id');
            $t->unsignedBigInteger('rf_id');
            $t->unsignedBigInteger('item_variant_id');
            $t->unsignedTinyInteger('unit_scale');
            $t->decimal('requested_qty', 20, 6);
            $t->decimal('approved_qty', 20, 6)->nullable();
            $t->decimal('issued_qty', 20, 6)->default(0);
            $t->decimal('canceled_qty', 20, 6)->default(0);
            $t->timestamps(6);
            $t->unique(['chapter_id', 'id']);
            $t->foreign('chapter_id')->references('id')->on('chapters');
            $t->foreign(['chapter_id', 'rf_id'], 'req_lines_rf_fk')->references(['chapter_id', 'id'])->on('requisitions');
            $t->foreign(['chapter_id', 'item_variant_id'], 'req_lines_iv_fk')->references(['chapter_id', 'id'])->on('item_variants');
        });
        DB::statement('ALTER TABLE requisition_lines ADD CONSTRAINT req_lines_qty_chk CHECK (requested_qty > 0 AND issued_qty >= 0 AND canceled_qty >= 0 AND (approved_qty IS NULL OR (approved_qty >= 0 AND approved_qty <= requested_qty)) AND unit_scale BETWEEN 0 AND 6)');

        Schema::create('requisition_events', function (Blueprint $t): void {
            $t->engine = 'InnoDB';
            $t->id();
            $t->unsignedBigInteger('chapter_id');
            $t->unsignedBigInteger('rf_id');
            $t->unsignedInteger('row_version');
            $t->unsignedInteger('material_version');
            $t->unsignedInteger('progress_version');
            $t->string('action', 48)->charset('ascii')->collation('ascii_bin');
            $t->unsignedBigInteger('actor_user_id');
            $t->string('reason', 255)->nullable();
            $t->timestamp('occurred_at', 6);
            $t->index(['chapter_id', 'rf_id', 'id'], 'req_events_rf_idx');
            $t->foreign('chapter_id')->references('id')->on('chapters');
            $t->foreign(['chapter_id', 'rf_id'], 'req_events_rf_fk')->references(['chapter_id', 'id'])->on('requisitions');
            $t->foreign('actor_user_id')->references('id')->on('users');
        });

        Schema::create('rf_reservation_preparations', function (Blueprint $t): void {
            $t->engine = 'InnoDB';
            $t->id();
            $t->unsignedBigInteger('chapter_id');
            $t->unsignedBigInteger('rf_id');
            $t->unsignedBigInteger('rf_line_id');
            $t->unsignedBigInteger('stock_position_id');
            $t->unsignedBigInteger('stock_lot_id');
            $t->decimal('offset_qty', 20, 6);
            $t->decimal('quantity', 20, 6);
            $t->unsignedTinyInteger('unit_scale');
            $t->unsignedInteger('prepared_rf_version');
            $t->unsignedInteger('prepared_material_version');
            $t->unsignedInteger('prepared_progress_version');
            $t->unsignedBigInteger('prepared_position_version');
            $t->string('state', 16)->charset('ascii')->collation('ascii_bin')->default('prepared');
            $t->unsignedInteger('row_version')->default(1);
            $t->unsignedBigInteger('reservation_id')->nullable();
            $t->unsignedBigInteger('prepared_by_user_id');
            $t->timestamps(6);
            $t->unique(['chapter_id', 'id']);
            $t->foreign('chapter_id')->references('id')->on('chapters');
            $t->foreign(['chapter_id', 'rf_id'], 'rf_prep_rf_fk')->references(['chapter_id', 'id'])->on('requisitions');
            $t->foreign(['chapter_id', 'rf_line_id'], 'rf_prep_line_fk')->references(['chapter_id', 'id'])->on('requisition_lines');
            $t->foreign(['chapter_id', 'stock_position_id'], 'rf_prep_pos_fk')->references(['chapter_id', 'id'])->on('stock_positions');
            $t->foreign(['chapter_id', 'stock_lot_id'], 'rf_prep_lot_fk')->references(['chapter_id', 'id'])->on('stock_lots');
            $t->foreign('prepared_by_user_id')->references('id')->on('users');
        });
        DB::statement("ALTER TABLE rf_reservation_preparations ADD CONSTRAINT rf_prep_qty_chk CHECK (offset_qty >= 0 AND quantity > 0 AND unit_scale BETWEEN 0 AND 6 AND row_version >= 1), ADD CONSTRAINT rf_prep_state_chk CHECK (state IN ('prepared','committed'))");

        Schema::create('rf_reservations', function (Blueprint $t): void {
            $t->engine = 'InnoDB';
            $t->id();
            $t->unsignedBigInteger('chapter_id');
            $t->unsignedBigInteger('preparation_id')->nullable();
            $t->unsignedBigInteger('rf_id');
            $t->unsignedBigInteger('rf_line_id');
            $t->unsignedBigInteger('item_variant_id');
            $t->unsignedBigInteger('stock_position_id');
            $t->unsignedBigInteger('stock_lot_id');
            $t->decimal('offset_qty', 20, 6);
            $t->decimal('committed_qty', 20, 6);
            $t->decimal('active_qty', 20, 6);
            $t->decimal('fulfilled_qty', 20, 6)->default(0);
            $t->decimal('released_qty', 20, 6)->default(0);
            $t->unsignedTinyInteger('unit_scale');
            $t->string('status', 24)->charset('ascii')->collation('ascii_bin')->default('active');
            $t->unsignedInteger('row_version')->default(1);
            $t->unsignedInteger('material_version');
            $t->timestamp('unpaid_expires_at', 6)->nullable();
            $t->timestamp('reserved_at', 6);
            $t->timestamp('updated_at', 6);
            $t->unique(['chapter_id', 'id']);
            $t->foreign('chapter_id')->references('id')->on('chapters');
            $t->foreign(['chapter_id', 'rf_id'], 'rf_res_rf_fk')->references(['chapter_id', 'id'])->on('requisitions');
            $t->foreign(['chapter_id', 'rf_line_id'], 'rf_res_line_fk')->references(['chapter_id', 'id'])->on('requisition_lines');
            $t->foreign(['chapter_id', 'item_variant_id'], 'rf_res_iv_fk')->references(['chapter_id', 'id'])->on('item_variants');
            $t->foreign(['chapter_id', 'stock_position_id'], 'rf_res_pos_fk')->references(['chapter_id', 'id'])->on('stock_positions');
            $t->foreign(['chapter_id', 'stock_lot_id'], 'rf_res_lot_fk')->references(['chapter_id', 'id'])->on('stock_lots');
        });
        DB::statement("ALTER TABLE rf_reservations ADD CONSTRAINT rf_res_invariants CHECK (unpaid_expires_at IS NULL AND offset_qty >= 0 AND committed_qty > 0 AND active_qty >= 0 AND fulfilled_qty + released_qty <= committed_qty AND unit_scale BETWEEN 0 AND 6 AND row_version >= 1), ADD CONSTRAINT rf_res_status_chk CHECK (status IN ('active','blocked','partially_blocked','fulfilled','released','closed_mixed'))");

        Schema::create('rf_reservation_cells', function (Blueprint $t): void {
            $t->engine = 'InnoDB';
            $t->id();
            $t->unsignedBigInteger('chapter_id');
            $t->unsignedBigInteger('reservation_id');
            $t->unsignedBigInteger('stock_coverage_cell_id');
            $t->boolean('is_active')->default(true);
            $t->timestamps(6);
            $t->unique(['reservation_id', 'stock_coverage_cell_id'], 'rf_res_cells_unique');
            $t->foreign('chapter_id')->references('id')->on('chapters');
            $t->foreign(['chapter_id', 'reservation_id'], 'rf_res_cells_res_fk')->references(['chapter_id', 'id'])->on('rf_reservations');
            $t->foreign(['chapter_id', 'stock_coverage_cell_id'], 'rf_res_cells_cell_fk')->references(['chapter_id', 'id'])->on('stock_coverage_live');
        });

        Schema::create('rf_reservation_events', function (Blueprint $t): void {
            $t->engine = 'InnoDB';
            $t->id();
            $t->unsignedBigInteger('chapter_id');
            $t->unsignedBigInteger('reservation_id');
            $t->string('event_code', 32)->charset('ascii')->collation('ascii_bin');
            $t->decimal('quantity', 20, 6);
            $t->unsignedBigInteger('actor_user_id');
            $t->string('reason', 255)->nullable();
            $t->timestamp('occurred_at', 6);
            $t->index(['chapter_id', 'reservation_id', 'id'], 'rf_res_events_idx');
            $t->foreign('chapter_id')->references('id')->on('chapters');
            $t->foreign(['chapter_id', 'reservation_id'], 'rf_res_ev_res_fk')->references(['chapter_id', 'id'])->on('rf_reservations');
            $t->foreign('actor_user_id')->references('id')->on('users');
        });
        DB::statement('ALTER TABLE rf_reservation_events ADD CONSTRAINT rf_res_ev_qty_chk CHECK (quantity > 0)');

        $div = 'CASE v_scale WHEN 0 THEN 1000000 WHEN 1 THEN 100000 WHEN 2 THEN 10000 WHEN 3 THEN 1000 WHEN 4 THEN 100 WHEN 5 THEN 10 ELSE 1 END';
        foreach (['INSERT', 'UPDATE'] as $ev) {
            $suf = strtolower($ev);
            DB::unprepared("CREATE TRIGGER tr_req_lines_scale_{$suf} BEFORE {$ev} ON requisition_lines FOR EACH ROW BEGIN DECLARE v_scale TINYINT UNSIGNED; DECLARE v_div BIGINT UNSIGNED; SELECT u.quantity_scale INTO v_scale FROM item_variants iv JOIN items i ON i.id = iv.item_id JOIN units u ON u.id = i.base_unit_id WHERE iv.id = NEW.item_variant_id AND iv.chapter_id = NEW.chapter_id; IF NEW.unit_scale <> v_scale THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'UNIT_SCALE_MISMATCH'; END IF; SET v_div = ({$div}); IF MOD(CAST(NEW.requested_qty * 1000000 AS DECIMAL(24,0)), v_div) <> 0 OR (NEW.approved_qty IS NOT NULL AND MOD(CAST(NEW.approved_qty * 1000000 AS DECIMAL(24,0)), v_div) <> 0) OR MOD(CAST(NEW.issued_qty * 1000000 AS DECIMAL(24,0)), v_div) <> 0 OR MOD(CAST(NEW.canceled_qty * 1000000 AS DECIMAL(24,0)), v_div) <> 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'UNIT_PRECISION_VIOLATION'; END IF; END");
            DB::unprepared("CREATE TRIGGER tr_rf_prep_scale_{$suf} BEFORE {$ev} ON rf_reservation_preparations FOR EACH ROW BEGIN DECLARE v_scale TINYINT UNSIGNED; DECLARE v_div BIGINT UNSIGNED; SELECT unit_scale INTO v_scale FROM stock_positions WHERE id = NEW.stock_position_id AND chapter_id = NEW.chapter_id; IF NEW.unit_scale <> v_scale THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'UNIT_SCALE_MISMATCH'; END IF; SET v_div = ({$div}); IF MOD(CAST(NEW.offset_qty * 1000000 AS DECIMAL(24,0)), v_div) <> 0 OR MOD(CAST(NEW.quantity * 1000000 AS DECIMAL(24,0)), v_div) <> 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'UNIT_PRECISION_VIOLATION'; END IF; END");
            DB::unprepared("CREATE TRIGGER tr_rf_res_scale_{$suf} BEFORE {$ev} ON rf_reservations FOR EACH ROW BEGIN DECLARE v_scale TINYINT UNSIGNED; DECLARE v_div BIGINT UNSIGNED; SELECT u.quantity_scale INTO v_scale FROM item_variants iv JOIN items i ON i.id = iv.item_id JOIN units u ON u.id = i.base_unit_id WHERE iv.id = NEW.item_variant_id AND iv.chapter_id = NEW.chapter_id; IF NEW.unit_scale <> v_scale THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'UNIT_SCALE_MISMATCH'; END IF; SET v_div = ({$div}); IF MOD(CAST(NEW.offset_qty * 1000000 AS DECIMAL(24,0)), v_div) <> 0 OR MOD(CAST(NEW.committed_qty * 1000000 AS DECIMAL(24,0)), v_div) <> 0 OR MOD(CAST(NEW.active_qty * 1000000 AS DECIMAL(24,0)), v_div) <> 0 OR MOD(CAST(NEW.fulfilled_qty * 1000000 AS DECIMAL(24,0)), v_div) <> 0 OR MOD(CAST(NEW.released_qty * 1000000 AS DECIMAL(24,0)), v_div) <> 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'UNIT_PRECISION_VIOLATION'; END IF; END");
        }
        DB::unprepared("CREATE TRIGGER tr_rf_res_events_scale_insert BEFORE INSERT ON rf_reservation_events FOR EACH ROW BEGIN DECLARE v_scale TINYINT UNSIGNED; SELECT unit_scale INTO v_scale FROM rf_reservations WHERE id = NEW.reservation_id AND chapter_id = NEW.chapter_id; IF MOD(CAST(NEW.quantity * 1000000 AS DECIMAL(24,0)), ({$div})) <> 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'UNIT_PRECISION_VIOLATION'; END IF; END");

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
        foreach (['tr_req_lines_scale_insert', 'tr_req_lines_scale_update', 'tr_rf_prep_scale_insert', 'tr_rf_prep_scale_update', 'tr_rf_res_scale_insert', 'tr_rf_res_scale_update', 'tr_rf_res_events_scale_insert'] as $tr) {
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
