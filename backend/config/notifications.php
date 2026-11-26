<?php

return [
    'broker_url' => env('NOTIFICATION_BROKER_URL', 'http://reverb:8080'),
    'app_key' => env('REVERB_APP_KEY', 'ysp-stage1'),
    'app_secret' => env('REVERB_APP_SECRET'),
];
