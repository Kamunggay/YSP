<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /** @var list<string> */
    private array $mutable = [
        'events', 'policies', 'policy_versions', 'priority_categories', 'units', 'items', 'item_variants',
        'item_variant_guards', 'item_policy_versions', 'stock_locations', 'custody_assignments',
        'stock_positions', 'stock_coverage_live', 'stock_coverage_reservation_links', 'stock_holds', 'stock_hold_cells',
    ];

    /** @var list<string> */
    private array $immutable = [
        'stock_conditions', 'restrictions', 'restriction_versions', 'restriction_item_scopes',
        'restriction_event_scopes', 'restriction_unit_scopes', 'restriction_category_scopes',
        'stock_lots', 'stock_hold_clearances',
        'inventory_operation_attempts', 'inventory_actor_attributions', 'inventory_operations', 'inventory_audit_events',
    ];

    public function up(): void
    {
        Schema::create('events', function (Blueprint $t): void {
            $t->engine = 'InnoDB';
            $t->id();
            $t->unsignedBigInteger('chapter_id');
            $t->string('code', 64)->charset('ascii')->collation('ascii_bin');
            $t->string('name', 160);
            $t->string('status', 16)->charset('ascii')->collation('ascii_bin')->default('planned');
            $t->timestamp('starts_at', 6)->nullable();
            $t->timestamp('ends_at', 6)->nullable();
            $t->timestamps(6);
            $t->unique(['chapter_id', 'id']);
            $t->unique(['chapter_id', 'code']);
            $t->foreign('chapter_id')->references('id')->on('chapters');
        });
        DB::statement("ALTER TABLE events ADD CONSTRAINT events_status_chk CHECK (status IN ('planned','active','closed','archived'))");

        Schema::create('policies', function (Blueprint $t): void {
            $t->engine = 'InnoDB';
            $t->id();
            $t->unsignedBigInteger('chapter_id');
            $t->string('policy_code', 64)->charset('ascii')->collation('ascii_bin');
            $t->string('title', 160);
            $t->timestamps(6);
            $t->unique(['chapter_id', 'id']);
            $t->unique(['chapter_id', 'policy_code']);
            $t->foreign('chapter_id')->references('id')->on('chapters');
        });

        Schema::create('policy_versions', function (Blueprint $t): void {
            $t->engine = 'InnoDB';
            $t->id();
            $t->unsignedBigInteger('chapter_id');
            $t->unsignedBigInteger('policy_id');
            $t->unsignedInteger('version_number');
            $t->string('status', 16)->charset('ascii')->collation('ascii_bin')->default('draft');
            $t->json('settings_json');
            $t->binary('settings_hash', 32);
            $t->unsignedBigInteger('authored_by_user_id');
            $t->unsignedBigInteger('approved_by_user_id')->nullable();
            $t->timestamp('approved_at', 6)->nullable();
            $t->timestamps(6);
            $t->unique(['chapter_id', 'id']);
            $t->unique(['policy_id', 'version_number']);
            $t->foreign('chapter_id')->references('id')->on('chapters');
            $t->foreign(['chapter_id', 'policy_id'])->references(['chapter_id', 'id'])->on('policies');
            $t->foreign('authored_by_user_id')->references('id')->on('users');
            $t->foreign('approved_by_user_id')->references('id')->on('users');
        });
        DB::statement('ALTER TABLE policy_versions MODIFY settings_hash BINARY(32) NOT NULL');
        DB::statement("ALTER TABLE policy_versions ADD CONSTRAINT policy_versions_num_check CHECK (version_number >= 1), ADD CONSTRAINT policy_versions_status_chk CHECK (status IN ('draft','approved','retired')), ADD CONSTRAINT policy_versions_dual_control CHECK (approved_by_user_id IS NULL OR approved_by_user_id <> authored_by_user_id)");

        Schema::create('priority_categories', function (Blueprint $t): void {
            $t->engine = 'InnoDB';
            $t->id();
            $t->unsignedBigInteger('chapter_id');
            $t->string('code', 64)->charset('ascii')->collation('ascii_bin');
            $t->string('name', 160);
            $t->unsignedSmallInteger('priority_rank')->default(100);
            $t->boolean('active')->default(true);
            $t->timestamps(6);
            $t->unique(['chapter_id', 'id']);
            $t->unique(['chapter_id', 'code']);
            $t->foreign('chapter_id')->references('id')->on('chapters');
        });

        Schema::create('units', function (Blueprint $t): void {
            $t->engine = 'InnoDB';
            $t->id();
            $t->unsignedBigInteger('chapter_id');
            $t->string('code', 32)->charset('ascii')->collation('ascii_bin');
            $t->string('name', 120);
            $t->unsignedTinyInteger('quantity_scale')->default(0);
            $t->unsignedInteger('row_version')->default(1);
            $t->boolean('active')->default(true);
            $t->timestamps(6);
            $t->unique(['chapter_id', 'id']);
            $t->unique(['chapter_id', 'code']);
            $t->foreign('chapter_id')->references('id')->on('chapters');
        });
        DB::statement('ALTER TABLE units ADD CONSTRAINT units_scale_range CHECK (quantity_scale BETWEEN 0 AND 6), ADD CONSTRAINT units_ver_chk CHECK (row_version >= 1)');

        Schema::create('items', function (Blueprint $t): void {
            $t->engine = 'InnoDB';
            $t->id();
            $t->unsignedBigInteger('chapter_id');
            $t->string('sku', 64)->charset('ascii')->collation('ascii_bin');
            $t->string('name', 160);
            $t->string('description', 500)->nullable();
            $t->string('item_kind', 24)->charset('ascii')->collation('ascii_bin');
            $t->unsignedBigInteger('base_unit_id');
            $t->decimal('reorder_point', 20, 6)->default(0);
            $t->unsignedInteger('row_version')->default(1);
            $t->boolean('active')->default(true);
            $t->timestamps(6);
            $t->unique(['chapter_id', 'id']);
            $t->unique(['chapter_id', 'sku']);
            $t->foreign('chapter_id')->references('id')->on('chapters');
            $t->foreign(['chapter_id', 'base_unit_id'])->references(['chapter_id', 'id'])->on('units');
        });
        DB::statement("ALTER TABLE items ADD CONSTRAINT items_rop_nonneg CHECK (reorder_point >= 0), ADD CONSTRAINT items_kind_chk CHECK (item_kind IN ('consumable','returnable','kit','saleable')), ADD CONSTRAINT items_ver_chk CHECK (row_version >= 1)");

        Schema::create('item_variants', function (Blueprint $t): void {
            $t->engine = 'InnoDB';
            $t->id();
            $t->unsignedBigInteger('chapter_id');
            $t->unsignedBigInteger('item_id');
            $t->string('variant_code', 64)->charset('ascii')->collation('ascii_bin');
            $t->string('name', 160);
            $t->json('attributes_json')->nullable();
            $t->unsignedInteger('row_version')->default(1);
            $t->boolean('active')->default(true);
            $t->timestamps(6);
            $t->unique(['chapter_id', 'id']);
            $t->unique(['item_id', 'variant_code']);
            $t->foreign('chapter_id')->references('id')->on('chapters');
            $t->foreign(['chapter_id', 'item_id'])->references(['chapter_id', 'id'])->on('items');
        });
        DB::statement('ALTER TABLE item_variants ADD CONSTRAINT item_variants_ver_chk CHECK (row_version >= 1)');

        Schema::create('item_variant_guards', function (Blueprint $t): void {
            $t->engine = 'InnoDB';
            $t->id();
            $t->unsignedBigInteger('chapter_id');
            $t->unsignedBigInteger('item_variant_id');
            $t->unsignedBigInteger('guard_version')->default(1);
            $t->timestamp('updated_at', 6);
            $t->unique(['chapter_id', 'id']);
            $t->unique(['chapter_id', 'item_variant_id']);
            $t->foreign('chapter_id')->references('id')->on('chapters');
            $t->foreign(['chapter_id', 'item_variant_id'])->references(['chapter_id', 'id'])->on('item_variants');
        });
        DB::statement('ALTER TABLE item_variant_guards ADD CONSTRAINT item_variant_guards_ver_check CHECK (guard_version >= 1)');

        Schema::create('item_policy_versions', function (Blueprint $t): void {
            $t->engine = 'InnoDB';
            $t->id();
            $t->unsignedBigInteger('chapter_id');
            $t->unsignedBigInteger('item_id');
            $t->unsignedBigInteger('policy_version_id')->nullable();
            $t->unsignedInteger('version_number');
            $t->string('status', 16)->charset('ascii')->collation('ascii_bin')->default('draft');
            $t->boolean('is_eligibility_approved')->default(false);
            $t->boolean('requires_condition_check')->default(true);
            $t->unsignedInteger('max_hold_hours')->nullable();
            $t->json('settings_json');
            $t->binary('settings_hash', 32);
            $t->unsignedBigInteger('authored_by_user_id');
            $t->unsignedBigInteger('approved_by_user_id')->nullable();
            $t->timestamp('approved_at', 6)->nullable();
            $t->timestamps(6);
            $t->unique(['chapter_id', 'id']);
            $t->unique(['item_id', 'version_number']);
            $t->foreign('chapter_id')->references('id')->on('chapters');
            $t->foreign(['chapter_id', 'item_id'])->references(['chapter_id', 'id'])->on('items');
            $t->foreign(['chapter_id', 'policy_version_id'])->references(['chapter_id', 'id'])->on('policy_versions');
            $t->foreign('authored_by_user_id')->references('id')->on('users');
            $t->foreign('approved_by_user_id')->references('id')->on('users');
        });
        DB::statement('ALTER TABLE item_policy_versions MODIFY settings_hash BINARY(32) NOT NULL');
        DB::statement("ALTER TABLE item_policy_versions ADD CONSTRAINT item_policy_ver_num CHECK (version_number >= 1), ADD CONSTRAINT item_policy_status_chk CHECK (status IN ('draft','approved','retired')), ADD CONSTRAINT item_policy_dual_control CHECK (approved_by_user_id IS NULL OR approved_by_user_id <> authored_by_user_id), ADD CONSTRAINT item_policy_hold_hours CHECK (max_hold_hours IS NULL OR max_hold_hours >= 1)");

        Schema::create('stock_conditions', function (Blueprint $t): void {
            $t->engine = 'InnoDB';
            $t->id();
            $t->string('code', 32)->charset('ascii')->collation('ascii_bin')->unique();
            $t->string('name', 120);
            $t->boolean('is_usable_for_issue');
            $t->boolean('is_restricted_condition');
            $t->unsignedSmallInteger('sort_order');
            $t->timestamp('created_at', 6);
        });
        $now = now()->format('Y-m-d H:i:s.u');
        DB::table('stock_conditions')->insert([
            ['code' => 'usable', 'name' => 'Usable', 'is_usable_for_issue' => true, 'is_restricted_condition' => false, 'sort_order' => 1, 'created_at' => $now],
            ['code' => 'damaged', 'name' => 'Damaged', 'is_usable_for_issue' => false, 'is_restricted_condition' => true, 'sort_order' => 2, 'created_at' => $now],
            ['code' => 'quarantined', 'name' => 'Quarantined', 'is_usable_for_issue' => false, 'is_restricted_condition' => true, 'sort_order' => 3, 'created_at' => $now],
            ['code' => 'expired', 'name' => 'Expired', 'is_usable_for_issue' => false, 'is_restricted_condition' => true, 'sort_order' => 4, 'created_at' => $now],
            ['code' => 'disposed', 'name' => 'Disposed', 'is_usable_for_issue' => false, 'is_restricted_condition' => true, 'sort_order' => 5, 'created_at' => $now],
        ]);

        Schema::create('stock_locations', function (Blueprint $t): void {
            $t->engine = 'InnoDB';
            $t->id();
            $t->unsignedBigInteger('chapter_id');
            $t->string('code', 64)->charset('ascii')->collation('ascii_bin');
            $t->string('name', 160);
            $t->string('location_kind', 24)->charset('ascii')->collation('ascii_bin')->default('warehouse');
            $t->unsignedInteger('row_version')->default(1);
            $t->boolean('active')->default(true);
            $t->timestamps(6);
            $t->unique(['chapter_id', 'id']);
            $t->unique(['chapter_id', 'code']);
            $t->foreign('chapter_id')->references('id')->on('chapters');
        });
        DB::statement("ALTER TABLE stock_locations ADD CONSTRAINT stock_locations_kind_chk CHECK (location_kind IN ('warehouse','booth','field_kit','quarantine','transit')), ADD CONSTRAINT stock_locations_ver_chk CHECK (row_version >= 1)");

        Schema::create('custody_assignments', function (Blueprint $t): void {
            $t->engine = 'InnoDB';
            $t->id();
            $t->unsignedBigInteger('chapter_id');
            $t->unsignedBigInteger('stock_location_id');
            $t->unsignedBigInteger('membership_id');
            $t->string('custody_role', 16)->charset('ascii')->collation('ascii_bin')->default('primary');
            $t->string('status', 16)->charset('ascii')->collation('ascii_bin')->default('active');
            $t->unsignedInteger('row_version')->default(1);
            $t->unsignedBigInteger('assigned_by_user_id');
            $t->timestamp('assigned_at', 6);
            $t->timestamp('revoked_at', 6)->nullable();
            $t->timestamps(6);
            $t->unique(['chapter_id', 'id']);
            $t->index(['chapter_id', 'stock_location_id', 'status'], 'custody_loc_status_idx');
            $t->foreign('chapter_id')->references('id')->on('chapters');
            $t->foreign(['chapter_id', 'stock_location_id'])->references(['chapter_id', 'id'])->on('stock_locations');
            $t->foreign('membership_id')->references('id')->on('memberships');
            $t->foreign('assigned_by_user_id')->references('id')->on('users');
        });
        DB::statement("ALTER TABLE custody_assignments ADD CONSTRAINT custody_role_chk CHECK (custody_role IN ('primary','deputy')), ADD CONSTRAINT custody_status_chk CHECK (status IN ('active','revoked')), ADD CONSTRAINT custody_ver_chk CHECK (row_version >= 1)");

        Schema::create('restrictions', function (Blueprint $t): void {
            $t->engine = 'InnoDB';
            $t->id();
            $t->unsignedBigInteger('chapter_id');
            $t->string('code', 64)->charset('ascii')->collation('ascii_bin');
            $t->string('title', 160);
            $t->string('donor_reference', 160)->nullable();
            $t->unsignedInteger('row_version')->default(1);
            $t->unsignedBigInteger('created_by_user_id');
            $t->timestamp('created_at', 6);
            $t->unique(['chapter_id', 'id']);
            $t->unique(['chapter_id', 'code']);
            $t->foreign('chapter_id')->references('id')->on('chapters');
            $t->foreign('created_by_user_id')->references('id')->on('users');
        });
        DB::statement('ALTER TABLE restrictions ADD CONSTRAINT restrictions_ver_chk CHECK (row_version >= 1)');

        Schema::create('restriction_versions', function (Blueprint $t): void {
            $t->engine = 'InnoDB';
            $t->id();
            $t->unsignedBigInteger('chapter_id');
            $t->unsignedBigInteger('restriction_id');
            $t->unsignedInteger('version_number');
            $t->string('status', 16)->charset('ascii')->collation('ascii_bin')->default('active');
            $t->timestamp('effective_from', 6)->nullable();
            $t->timestamp('effective_until', 6)->nullable();
            $t->json('rules_json');
            $t->binary('terms_hash', 32);
            $t->unsignedBigInteger('created_by_user_id');
            $t->timestamp('created_at', 6);
            $t->unique(['chapter_id', 'id']);
            $t->unique(['restriction_id', 'version_number']);
            $t->foreign('chapter_id')->references('id')->on('chapters');
            $t->foreign(['chapter_id', 'restriction_id'])->references(['chapter_id', 'id'])->on('restrictions');
            $t->foreign('created_by_user_id')->references('id')->on('users');
        });
        DB::statement('ALTER TABLE restriction_versions MODIFY terms_hash BINARY(32) NOT NULL');
        DB::statement("ALTER TABLE restriction_versions ADD CONSTRAINT restriction_ver_num CHECK (version_number >= 1), ADD CONSTRAINT restriction_ver_status_chk CHECK (status IN ('active','superseded'))");

        foreach ([
            ['restriction_item_scopes', 'item_variant_id', 'item_variants', 'restr_item_scope_unique', 'restr_item', true],
            ['restriction_event_scopes', 'event_id', 'events', 'restr_event_scope_unique', 'restr_event', true],
            ['restriction_unit_scopes', 'requesting_unit_id', 'requesting_units', 'restr_unit_scope_unique', 'restr_unit', false],
            ['restriction_category_scopes', 'priority_category_id', 'priority_categories', 'restr_cat_scope_unique', 'restr_cat', true],
        ] as [$tbl, $col, $target, $uName, $fkPref, $composite]) {
            Schema::create($tbl, function (Blueprint $t) use ($col, $target, $uName, $fkPref, $composite): void {
                $t->engine = 'InnoDB';
                $t->id();
                $t->unsignedBigInteger('chapter_id');
                $t->unsignedBigInteger('restriction_version_id');
                $t->unsignedBigInteger($col);
                $t->string('scope_mode', 12)->charset('ascii')->collation('ascii_bin');
                $t->timestamp('created_at', 6);
                $t->unique(['restriction_version_id', $col], $uName);
                $t->foreign('chapter_id')->references('id')->on('chapters');
                $t->foreign(['chapter_id', 'restriction_version_id'], "{$fkPref}_rv_fk")->references(['chapter_id', 'id'])->on('restriction_versions');
                if ($composite) {
                    $t->foreign(['chapter_id', $col], "{$fkPref}_ref_fk")->references(['chapter_id', 'id'])->on($target);
                } else {
                    $t->foreign($col, "{$fkPref}_ref_fk")->references('id')->on($target);
                }
            });
            DB::statement("ALTER TABLE {$tbl} ADD CONSTRAINT {$fkPref}_mode_chk CHECK (scope_mode IN ('allow','deny'))");
        }

        Schema::create('stock_lots', function (Blueprint $t): void {
            $t->engine = 'InnoDB';
            $t->id();
            $t->unsignedBigInteger('chapter_id');
            $t->unsignedBigInteger('item_variant_id');
            $t->string('source_kind', 24)->charset('ascii')->collation('ascii_bin');
            $t->string('source_reference', 160);
            $t->unsignedBigInteger('restriction_version_id')->nullable();
            $t->timestamp('received_at', 6);
            $t->timestamp('expires_at', 6)->nullable();
            $t->decimal('initial_quantity', 20, 6);
            $t->unsignedTinyInteger('unit_scale');
            $t->timestamp('created_at', 6);
            $t->unique(['chapter_id', 'id']);
            $t->foreign('chapter_id')->references('id')->on('chapters');
            $t->foreign(['chapter_id', 'item_variant_id'], 'stock_lots_iv_fk')->references(['chapter_id', 'id'])->on('item_variants');
            $t->foreign(['chapter_id', 'restriction_version_id'], 'stock_lots_rv_fk')->references(['chapter_id', 'id'])->on('restriction_versions');
        });
        DB::statement("ALTER TABLE stock_lots ADD CONSTRAINT stock_lots_kind_chk CHECK (source_kind IN ('opening','donation','purchase','transfer_in','return_to_stock')), ADD CONSTRAINT stock_lots_qty_pos CHECK (initial_quantity > 0), ADD CONSTRAINT stock_lots_scale_range CHECK (unit_scale BETWEEN 0 AND 6)");

        Schema::create('stock_positions', function (Blueprint $t): void {
            $t->engine = 'InnoDB';
            $t->id();
            $t->unsignedBigInteger('chapter_id');
            $t->unsignedBigInteger('item_variant_id');
            $t->unsignedBigInteger('stock_location_id');
            $t->unsignedBigInteger('stock_condition_id');
            $t->unsignedBigInteger('stock_lot_id');
            $t->unsignedTinyInteger('unit_scale');
            foreach (['on_hand_qty', 'reserved_qty', 'held_qty', 'blocked_qty', 'dispatched_qty', 'in_booth_qty', 'inbound_pending_qty'] as $col) {
                $t->decimal($col, 20, 6)->default(0);
            }
            $t->unsignedBigInteger('position_version')->default(1);
            $t->timestamp('updated_at', 6);
            $t->unique(['chapter_id', 'id']);
            $t->unique(['chapter_id', 'item_variant_id', 'stock_location_id', 'stock_condition_id', 'stock_lot_id'], 'stock_positions_tuple_unique');
            $t->foreign('chapter_id')->references('id')->on('chapters');
            $t->foreign(['chapter_id', 'item_variant_id'], 'stock_pos_iv_fk')->references(['chapter_id', 'id'])->on('item_variants');
            $t->foreign(['chapter_id', 'stock_location_id'], 'stock_pos_loc_fk')->references(['chapter_id', 'id'])->on('stock_locations');
            $t->foreign('stock_condition_id', 'stock_pos_cond_fk')->references('id')->on('stock_conditions');
            $t->foreign(['chapter_id', 'stock_lot_id'], 'stock_pos_lot_fk')->references(['chapter_id', 'id'])->on('stock_lots');
        });
        DB::statement('ALTER TABLE stock_positions ADD CONSTRAINT stock_pos_nonneg CHECK (on_hand_qty >= 0 AND reserved_qty >= 0 AND held_qty >= 0 AND blocked_qty >= 0 AND dispatched_qty >= 0 AND in_booth_qty >= 0 AND inbound_pending_qty >= 0), ADD CONSTRAINT stock_pos_blocked_bounds CHECK (blocked_qty >= reserved_qty AND blocked_qty >= held_qty AND blocked_qty <= on_hand_qty), ADD CONSTRAINT stock_pos_scale_range CHECK (unit_scale BETWEEN 0 AND 6), ADD CONSTRAINT stock_pos_ver_check CHECK (position_version >= 1)');

        Schema::create('stock_coverage_live', function (Blueprint $t): void {
            $t->engine = 'InnoDB';
            $t->id();
            $t->unsignedBigInteger('chapter_id');
            $t->unsignedBigInteger('item_variant_id');
            $t->unsignedBigInteger('stock_position_id');
            $t->decimal('start_qty', 20, 6);
            $t->decimal('end_qty', 20, 6);
            $t->unsignedInteger('reservation_count')->default(0);
            $t->unsignedInteger('hold_count')->default(0);
            $t->unsignedBigInteger('row_version')->default(1);
            $t->timestamp('updated_at', 6);
            $t->unique(['chapter_id', 'id']);
            $t->unique(['stock_position_id', 'start_qty'], 'stock_cov_pos_start_unique');
            $t->unique(['stock_position_id', 'end_qty'], 'stock_cov_pos_end_unique');
            $t->foreign('chapter_id')->references('id')->on('chapters');
            $t->foreign(['chapter_id', 'item_variant_id'], 'stock_cov_iv_fk')->references(['chapter_id', 'id'])->on('item_variants');
            $t->foreign(['chapter_id', 'stock_position_id'], 'stock_cov_pos_fk')->references(['chapter_id', 'id'])->on('stock_positions');
        });
        DB::statement('ALTER TABLE stock_coverage_live ADD CONSTRAINT stock_cov_interval_check CHECK (start_qty >= 0 AND end_qty > start_qty AND row_version >= 1)');

        Schema::create('stock_coverage_reservation_links', function (Blueprint $t): void {
            $t->engine = 'InnoDB';
            $t->id();
            $t->unsignedBigInteger('chapter_id');
            $t->unsignedBigInteger('stock_coverage_cell_id');
            $t->string('reservation_ref', 80)->charset('ascii')->collation('ascii_bin');
            $t->timestamp('created_at', 6);
            $t->unique(['stock_coverage_cell_id', 'reservation_ref'], 'stock_cov_res_links_unique');
            $t->foreign('chapter_id')->references('id')->on('chapters');
            $t->foreign(['chapter_id', 'stock_coverage_cell_id'], 'stock_cov_res_cell_fk')->references(['chapter_id', 'id'])->on('stock_coverage_live');
        });

        Schema::create('inventory_operation_attempts', function (Blueprint $t): void {
            $t->engine = 'InnoDB';
            $t->id();
            $t->char('public_id', 26)->charset('ascii')->collation('ascii_bin')->unique();
            $t->unsignedBigInteger('chapter_id');
            $t->unsignedBigInteger('user_id');
            $t->string('action_code', 64)->charset('ascii')->collation('ascii_bin');
            $t->string('idempotency_key', 128)->charset('ascii')->collation('ascii_bin');
            $t->char('payload_hash', 64)->charset('ascii')->collation('ascii_bin');
            $t->string('input_schema', 96)->charset('ascii')->collation('ascii_bin');
            $t->timestamp('created_at', 6);
            $t->unique(['chapter_id', 'action_code', 'idempotency_key'], 'inv_op_attempts_idempotency_unique');
            $t->foreign('chapter_id')->references('id')->on('chapters');
            $t->foreign('user_id')->references('id')->on('users');
        });

        Schema::create('inventory_actor_attributions', function (Blueprint $t): void {
            $t->engine = 'InnoDB';
            $t->id();
            $t->unsignedBigInteger('attempt_id')->unique();
            $t->unsignedBigInteger('chapter_id');
            $t->unsignedBigInteger('membership_id')->nullable();
            $t->unsignedBigInteger('duty_grant_id')->nullable();
            $t->unsignedInteger('authority_version');
            $t->json('actor_snapshot');
            $t->timestamp('occurred_at', 6);
            $t->foreign('attempt_id')->references('id')->on('inventory_operation_attempts');
            $t->foreign('chapter_id')->references('id')->on('chapters');
            $t->foreign('membership_id')->references('id')->on('memberships');
            $t->foreign('duty_grant_id')->references('id')->on('duty_grants');
        });

        Schema::create('inventory_operations', function (Blueprint $t): void {
            $t->engine = 'InnoDB';
            $t->id();
            $t->unsignedBigInteger('chapter_id');
            $t->unsignedBigInteger('attempt_id')->unique();
            $t->unsignedBigInteger('actor_attribution_id')->unique();
            $t->string('outcome', 32)->charset('ascii')->collation('ascii_bin');
            $t->unsignedSmallInteger('http_status');
            $t->json('result_snapshot');
            $t->timestamp('committed_at', 6);
            $t->foreign('chapter_id')->references('id')->on('chapters');
            $t->foreign('attempt_id')->references('id')->on('inventory_operation_attempts');
            $t->foreign('actor_attribution_id')->references('id')->on('inventory_actor_attributions');
        });
        DB::statement("ALTER TABLE inventory_operations ADD CONSTRAINT inv_ops_outcome_chk CHECK (outcome IN ('committed','rejected'))");

        Schema::create('inventory_audit_events', function (Blueprint $t): void {
            $t->engine = 'InnoDB';
            $t->id();
            $t->unsignedBigInteger('chapter_id');
            $t->unsignedBigInteger('operation_id');
            $t->string('event_code', 64)->charset('ascii')->collation('ascii_bin');
            $t->json('after_snapshot');
            $t->timestamp('occurred_at', 6);
            $t->index(['chapter_id', 'occurred_at'], 'inv_audit_chapter_time_idx');
            $t->foreign('chapter_id')->references('id')->on('chapters');
            $t->foreign('operation_id')->references('id')->on('inventory_operations');
        });

        Schema::create('stock_holds', function (Blueprint $t): void {
            $t->engine = 'InnoDB';
            $t->id();
            $t->char('public_id', 26)->charset('ascii')->collation('ascii_bin')->unique();
            $t->unsignedBigInteger('chapter_id');
            $t->unsignedBigInteger('item_variant_id');
            $t->unsignedBigInteger('stock_position_id');
            $t->string('hold_kind', 24)->charset('ascii')->collation('ascii_bin');
            $t->string('reason', 255);
            $t->decimal('quantity', 20, 6);
            $t->unsignedTinyInteger('unit_scale');
            $t->string('status', 16)->charset('ascii')->collation('ascii_bin')->default('active');
            $t->unsignedInteger('row_version')->default(1);
            $t->timestamp('expires_at', 6)->nullable();
            $t->unsignedBigInteger('created_by_user_id');
            $t->unsignedBigInteger('attempt_id');
            $t->timestamps(6);
            $t->unique(['chapter_id', 'id']);
            $t->index(['chapter_id', 'stock_position_id', 'status'], 'stock_holds_pos_status_idx');
            $t->foreign('chapter_id')->references('id')->on('chapters');
            $t->foreign(['chapter_id', 'item_variant_id'], 'stock_holds_iv_fk')->references(['chapter_id', 'id'])->on('item_variants');
            $t->foreign(['chapter_id', 'stock_position_id'], 'stock_holds_pos_fk')->references(['chapter_id', 'id'])->on('stock_positions');
            $t->foreign('created_by_user_id')->references('id')->on('users');
            $t->foreign('attempt_id')->references('id')->on('inventory_operation_attempts');
        });
        DB::statement("ALTER TABLE stock_holds ADD CONSTRAINT stock_holds_kind_chk CHECK (hold_kind IN ('quarantine','inspection','legal_hold','recount','governance')), ADD CONSTRAINT stock_holds_status_chk CHECK (status IN ('active','released','expired','consumed')), ADD CONSTRAINT stock_holds_qty_pos CHECK (quantity > 0), ADD CONSTRAINT stock_holds_scale_range CHECK (unit_scale BETWEEN 0 AND 6), ADD CONSTRAINT stock_holds_ver_chk CHECK (row_version >= 1)");

        Schema::create('stock_hold_cells', function (Blueprint $t): void {
            $t->engine = 'InnoDB';
            $t->id();
            $t->unsignedBigInteger('chapter_id');
            $t->unsignedBigInteger('stock_hold_id');
            $t->unsignedBigInteger('stock_coverage_cell_id');
            $t->boolean('is_active')->default(true);
            $t->timestamps(6);
            $t->unique(['stock_hold_id', 'stock_coverage_cell_id'], 'stock_hold_cells_unique');
            $t->foreign('chapter_id')->references('id')->on('chapters');
            $t->foreign(['chapter_id', 'stock_hold_id'], 'stock_hold_cells_hold_fk')->references(['chapter_id', 'id'])->on('stock_holds');
            $t->foreign(['chapter_id', 'stock_coverage_cell_id'], 'stock_hold_cells_cell_fk')->references(['chapter_id', 'id'])->on('stock_coverage_live');
        });

        Schema::create('stock_hold_clearances', function (Blueprint $t): void {
            $t->engine = 'InnoDB';
            $t->id();
            $t->unsignedBigInteger('chapter_id');
            $t->unsignedBigInteger('stock_hold_id')->unique();
            $t->string('clearance_kind', 16)->charset('ascii')->collation('ascii_bin');
            $t->string('reason', 255)->nullable();
            $t->unsignedBigInteger('cleared_by_user_id');
            $t->unsignedBigInteger('attempt_id');
            $t->timestamp('cleared_at', 6);
            $t->foreign('chapter_id')->references('id')->on('chapters');
            $t->foreign(['chapter_id', 'stock_hold_id'], 'stock_hold_clr_hold_fk')->references(['chapter_id', 'id'])->on('stock_holds');
            $t->foreign('cleared_by_user_id')->references('id')->on('users');
            $t->foreign('attempt_id')->references('id')->on('inventory_operation_attempts');
        });
        DB::statement("ALTER TABLE stock_hold_clearances ADD CONSTRAINT stock_hold_clr_kind_chk CHECK (clearance_kind IN ('released','expired','consumed'))");

        $this->createTriggers();
        $this->grantMutablePrivileges();
    }

    public function down(): void
    {
        $triggers = ['tr_stock_holds_no_delete', 'tr_stock_holds_guard_update', 'tr_stock_holds_scale_insert',
            'tr_stock_lots_scale_insert', 'tr_stock_coverage_live_scale_insert', 'tr_stock_coverage_live_scale_update',
            'tr_stock_positions_scale_insert', 'tr_stock_positions_scale_update', 'tr_items_scale_insert',
            'tr_items_scale_update', 'tr_units_freeze_scale', 'tr_item_policy_versions_guard', 'tr_policy_versions_guard'];
        foreach ($this->immutable as $tbl) {
            $triggers[] = "tr_{$tbl}_no_update";
            $triggers[] = "tr_{$tbl}_no_delete";
        }
        foreach ($triggers as $tr) {
            DB::unprepared("DROP TRIGGER IF EXISTS {$tr}");
        }
        foreach (array_reverse([...array_slice($this->mutable, 0, 5), ...$this->immutable, ...array_slice($this->mutable, 5)]) as $tbl) {
            Schema::dropIfExists($tbl);
        }
    }

    private function createTriggers(): void
    {
        foreach ($this->immutable as $tbl) {
            foreach (['UPDATE', 'DELETE'] as $ev) {
                $act = strtolower($ev);
                DB::unprepared("CREATE TRIGGER tr_{$tbl}_no_{$act} BEFORE {$ev} ON {$tbl} FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'IMMUTABLE_RECORD: {$ev} forbidden on {$tbl}.'");
            }
        }
        DB::unprepared(<<<'SQL'
            CREATE TRIGGER tr_policy_versions_guard BEFORE UPDATE ON policy_versions FOR EACH ROW BEGIN
                IF OLD.status <> 'draft' AND NOT (OLD.status = 'approved' AND NEW.status = 'retired' AND NEW.chapter_id = OLD.chapter_id AND NEW.policy_id = OLD.policy_id AND NEW.version_number = OLD.version_number AND CAST(NEW.settings_json AS CHAR) = CAST(OLD.settings_json AS CHAR) AND NEW.settings_hash = OLD.settings_hash AND NEW.authored_by_user_id = OLD.authored_by_user_id AND NEW.approved_by_user_id <=> OLD.approved_by_user_id AND NEW.approved_at <=> OLD.approved_at) THEN
                    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'POLICY_VERSION_IMMUTABLE: Only approved->retired transition is permitted.';
                END IF;
                IF NEW.status = 'approved' AND (NEW.approved_by_user_id IS NULL OR NEW.approved_at IS NULL) THEN
                    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'POLICY_APPROVAL_REQUIRED: approved_by_user_id and approved_at are required.';
                END IF;
            END
            SQL);
        DB::unprepared(<<<'SQL'
            CREATE TRIGGER tr_item_policy_versions_guard BEFORE UPDATE ON item_policy_versions FOR EACH ROW BEGIN
                IF OLD.status <> 'draft' AND NOT (OLD.status = 'approved' AND NEW.status = 'retired' AND NEW.chapter_id = OLD.chapter_id AND NEW.item_id = OLD.item_id AND NEW.policy_version_id <=> OLD.policy_version_id AND NEW.version_number = OLD.version_number AND NEW.is_eligibility_approved = OLD.is_eligibility_approved AND NEW.requires_condition_check = OLD.requires_condition_check AND NEW.max_hold_hours <=> OLD.max_hold_hours AND CAST(NEW.settings_json AS CHAR) = CAST(OLD.settings_json AS CHAR) AND NEW.settings_hash = OLD.settings_hash AND NEW.authored_by_user_id = OLD.authored_by_user_id AND NEW.approved_by_user_id <=> OLD.approved_by_user_id AND NEW.approved_at <=> OLD.approved_at) THEN
                    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ITEM_POLICY_IMMUTABLE: Only approved->retired transition is permitted.';
                END IF;
                IF NEW.status = 'approved' AND (NEW.approved_by_user_id IS NULL OR NEW.approved_at IS NULL) THEN
                    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ITEM_POLICY_APPROVAL_REQUIRED: approved_by_user_id and approved_at are required.';
                END IF;
            END
            SQL);
        DB::unprepared("CREATE TRIGGER tr_units_freeze_scale BEFORE UPDATE ON units FOR EACH ROW BEGIN IF NEW.quantity_scale <> OLD.quantity_scale AND EXISTS (SELECT 1 FROM items WHERE base_unit_id = NEW.id LIMIT 1) THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'UNIT_SCALE_FROZEN: Unit scale cannot change once referenced by items.'; END IF; END");

        $div = 'CASE v_scale WHEN 0 THEN 1000000 WHEN 1 THEN 100000 WHEN 2 THEN 10000 WHEN 3 THEN 1000 WHEN 4 THEN 100 WHEN 5 THEN 10 ELSE 1 END';
        foreach (['INSERT', 'UPDATE'] as $ev) {
            $suf = strtolower($ev);
            DB::unprepared("CREATE TRIGGER tr_items_scale_{$suf} BEFORE {$ev} ON items FOR EACH ROW BEGIN DECLARE v_scale TINYINT UNSIGNED; SELECT quantity_scale INTO v_scale FROM units WHERE id = NEW.base_unit_id AND chapter_id = NEW.chapter_id; IF MOD(CAST(NEW.reorder_point * 1000000 AS DECIMAL(24,0)), ({$div})) <> 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'UNIT_PRECISION_VIOLATION: reorder_point exceeds unit quantity_scale.'; END IF; END");
            DB::unprepared("CREATE TRIGGER tr_stock_positions_scale_{$suf} BEFORE {$ev} ON stock_positions FOR EACH ROW BEGIN DECLARE v_scale TINYINT UNSIGNED; DECLARE v_div BIGINT UNSIGNED; SELECT u.quantity_scale INTO v_scale FROM item_variants iv JOIN items i ON i.id = iv.item_id JOIN units u ON u.id = i.base_unit_id WHERE iv.id = NEW.item_variant_id AND iv.chapter_id = NEW.chapter_id; IF NEW.unit_scale <> v_scale THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'UNIT_SCALE_MISMATCH'; END IF; SET v_div = ({$div}); IF MOD(CAST(NEW.on_hand_qty * 1000000 AS DECIMAL(24,0)), v_div) <> 0 OR MOD(CAST(NEW.reserved_qty * 1000000 AS DECIMAL(24,0)), v_div) <> 0 OR MOD(CAST(NEW.held_qty * 1000000 AS DECIMAL(24,0)), v_div) <> 0 OR MOD(CAST(NEW.blocked_qty * 1000000 AS DECIMAL(24,0)), v_div) <> 0 OR MOD(CAST(NEW.dispatched_qty * 1000000 AS DECIMAL(24,0)), v_div) <> 0 OR MOD(CAST(NEW.in_booth_qty * 1000000 AS DECIMAL(24,0)), v_div) <> 0 OR MOD(CAST(NEW.inbound_pending_qty * 1000000 AS DECIMAL(24,0)), v_div) <> 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'UNIT_PRECISION_VIOLATION'; END IF; END");
            DB::unprepared("CREATE TRIGGER tr_stock_coverage_live_scale_{$suf} BEFORE {$ev} ON stock_coverage_live FOR EACH ROW BEGIN DECLARE v_scale TINYINT UNSIGNED; DECLARE v_div BIGINT UNSIGNED; SELECT unit_scale INTO v_scale FROM stock_positions WHERE id = NEW.stock_position_id AND chapter_id = NEW.chapter_id; SET v_div = ({$div}); IF MOD(CAST(NEW.start_qty * 1000000 AS DECIMAL(24,0)), v_div) <> 0 OR MOD(CAST(NEW.end_qty * 1000000 AS DECIMAL(24,0)), v_div) <> 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'UNIT_PRECISION_VIOLATION'; END IF; END");
        }
        DB::unprepared("CREATE TRIGGER tr_stock_lots_scale_insert BEFORE INSERT ON stock_lots FOR EACH ROW BEGIN DECLARE v_scale TINYINT UNSIGNED; SELECT u.quantity_scale INTO v_scale FROM item_variants iv JOIN items i ON i.id = iv.item_id JOIN units u ON u.id = i.base_unit_id WHERE iv.id = NEW.item_variant_id AND iv.chapter_id = NEW.chapter_id; IF NEW.unit_scale <> v_scale THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'UNIT_SCALE_MISMATCH'; END IF; IF MOD(CAST(NEW.initial_quantity * 1000000 AS DECIMAL(24,0)), ({$div})) <> 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'UNIT_PRECISION_VIOLATION'; END IF; END");
        DB::unprepared("CREATE TRIGGER tr_stock_holds_scale_insert BEFORE INSERT ON stock_holds FOR EACH ROW BEGIN DECLARE v_scale TINYINT UNSIGNED; SELECT unit_scale INTO v_scale FROM stock_positions WHERE id = NEW.stock_position_id AND chapter_id = NEW.chapter_id; IF NEW.unit_scale <> v_scale THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'UNIT_SCALE_MISMATCH'; END IF; IF MOD(CAST(NEW.quantity * 1000000 AS DECIMAL(24,0)), ({$div})) <> 0 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'UNIT_PRECISION_VIOLATION'; END IF; END");
        DB::unprepared("CREATE TRIGGER tr_stock_holds_guard_update BEFORE UPDATE ON stock_holds FOR EACH ROW BEGIN IF OLD.status <> 'active' OR NEW.status NOT IN ('released','expired','consumed') OR NEW.row_version <> OLD.row_version + 1 OR NEW.chapter_id <> OLD.chapter_id OR NEW.public_id <> OLD.public_id OR NEW.item_variant_id <> OLD.item_variant_id OR NEW.stock_position_id <> OLD.stock_position_id OR NEW.hold_kind <> OLD.hold_kind OR NEW.quantity <> OLD.quantity OR NEW.unit_scale <> OLD.unit_scale OR NEW.created_by_user_id <> OLD.created_by_user_id OR NEW.attempt_id <> OLD.attempt_id THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'HOLD_TERMINAL_OR_IMMUTABLE'; END IF; END");
        DB::unprepared("CREATE TRIGGER tr_stock_holds_no_delete BEFORE DELETE ON stock_holds FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'IMMUTABLE_RECORD: Deletes forbidden on stock_holds.'");
    }

    private function grantMutablePrivileges(): void
    {
        $conn = DB::connection();
        $user = (string) config('database.runtime_username');
        $host = (string) config('database.runtime_host');
        $exists = DB::selectOne('SELECT EXISTS(SELECT 1 FROM mysql.user WHERE user = ? AND host = ?) AS found', [$user, $host]);
        if (! $exists || (int) $exists->found !== 1) {
            return;
        }
        $pdo = $conn->getPdo();
        $account = $pdo->quote($user).'@'.$pdo->quote($host);
        $db = '`'.str_replace('`', '``', $conn->getDatabaseName()).'`';
        foreach ($this->mutable as $tbl) {
            DB::unprepared("GRANT UPDATE, DELETE ON {$db}.`{$tbl}` TO {$account}");
        }
    }
};
