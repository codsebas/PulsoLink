#pragma once

// Copiar a config.local.h antes de compilar. Ese archivo está excluido de Git.
// Completar únicamente en la copia local; no publicar credenciales reales.
const char *kWifiSsid = "TU_RED_WIFI";
const char *kWifiPassword = "TU_CLAVE_WIFI";

// IP LAN de la computadora que ejecuta la API, nunca localhost ni la IP de la placa.
// Dirección ficticia de ejemplo: reemplazarla por la de tu computadora.
const char *kApiUrl = "http://192.168.1.100:3001/api/v1/dev/reading-test";
