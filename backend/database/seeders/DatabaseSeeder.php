<?php

namespace Database\Seeders;

use App\Models\Buyer;
use App\Models\SalesOrder;
use App\Models\SalesOrderLine;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $chapterId = 'chap-cebu-01';

        $buyer1 = Buyer::create([
            'chapter_id' => $chapterId,
            'name' => 'St. Peter Parish Youth Ministry',
            'organization_name' => 'Parish of St. Peter',
            'contact_person' => 'Bro. Dominic Reyes',
            'phone' => '+63 917 555 1234',
            'email' => 'dominic@stpetercebu.org',
            'address' => 'Mango Ave, Cebu City',
        ]);

        $buyer2 = Buyer::create([
            'chapter_id' => $chapterId,
            'name' => 'University Student Council',
            'organization_name' => 'University of San Carlos',
            'contact_person' => 'Patricia Gomez',
            'phone' => '+63 928 444 8899',
            'email' => 'usc.council@usc.edu.ph',
            'address' => 'Talamban Campus, Cebu City',
        ]);

        $buyer3 = Buyer::create([
            'chapter_id' => $chapterId,
            'name' => 'Cebu Leaders Fellowship',
            'organization_name' => 'Regional NGO Alliance',
            'contact_person' => 'Marco Alcantara',
            'phone' => '+63 939 111 2233',
            'email' => 'marco@cebuleaders.org',
            'address' => 'Osmeña Blvd, Cebu City',
        ]);

        // SO 1: Submitted order
        $so1 = SalesOrder::create([
            'chapter_id' => $chapterId,
            'so_number' => 'SO-CEBU-20261102-0001',
            'buyer_id' => $buyer1->id,
            'order_date' => '2026-11-02',
            'target_delivery_date' => '2026-11-10',
            'status' => 'SUBMITTED',
            'rejection_reason' => null,
            'terms_conditions' => 'Standard 48-hour reservation payment terms upon review approval.',
            'terms_version' => 1,
            'version' => 1,
            'created_by' => 'staff-officer-01',
            'approved_by' => null,
        ]);

        SalesOrderLine::create([
            'so_id' => $so1->id,
            'variant_id' => 'VAR-SHIRT-M',
            'unit_id' => 'PCS',
            'ordered_quantity' => 15,
            'unit_price' => 250.00,
            'line_total' => 3750.00,
            'reserved_quantity' => 0,
            'backordered_quantity' => 0,
            'delivered_quantity' => 0,
            'line_status' => 'ACTIVE',
            'material_version' => 1,
        ]);

        SalesOrderLine::create([
            'so_id' => $so1->id,
            'variant_id' => 'VAR-CAP-BLK',
            'unit_id' => 'PCS',
            'ordered_quantity' => 5,
            'unit_price' => 150.00,
            'line_total' => 750.00,
            'reserved_quantity' => 0,
            'backordered_quantity' => 0,
            'delivered_quantity' => 0,
            'line_status' => 'ACTIVE',
            'material_version' => 1,
        ]);

        // SO 2: Approved order
        $so2 = SalesOrder::create([
            'chapter_id' => $chapterId,
            'so_number' => 'SO-CEBU-20261102-0002',
            'buyer_id' => $buyer2->id,
            'order_date' => '2026-11-02',
            'target_delivery_date' => '2026-11-15',
            'status' => 'APPROVED',
            'rejection_reason' => null,
            'terms_conditions' => 'Standard 48-hour reservation payment terms upon review approval.',
            'terms_version' => 1,
            'version' => 1,
            'created_by' => 'staff-officer-02',
            'approved_by' => 'reviewer-pedro',
        ]);

        SalesOrderLine::create([
            'so_id' => $so2->id,
            'variant_id' => 'VAR-SHIRT-L',
            'unit_id' => 'PCS',
            'ordered_quantity' => 20,
            'unit_price' => 250.00,
            'line_total' => 5000.00,
            'reserved_quantity' => 0,
            'backordered_quantity' => 0,
            'delivered_quantity' => 0,
            'line_status' => 'ACTIVE',
            'material_version' => 1,
        ]);
    }
}
