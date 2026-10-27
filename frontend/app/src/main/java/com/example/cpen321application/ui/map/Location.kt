package com.example.cpen321application.ui.map

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.os.Looper
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.platform.LocalContext
import androidx.core.content.ContextCompat
import com.example.cpen321application.data.GeoPoint
import com.google.android.gms.location.LocationCallback
import com.google.android.gms.location.LocationRequest
import com.google.android.gms.location.LocationResult
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.pow
import kotlin.math.roundToInt
import kotlin.math.sin
import kotlin.math.sqrt

private const val EARTH_RADIUS_M = 6_371_000.0
private const val METRES_PER_KM = 1000.0
private const val UPDATE_INTERVAL_MS = 10_000L
private const val MIN_UPDATE_DISTANCE_M = 10f

val LOCATION_PERMISSIONS = arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)

fun hasLocationPermission(context: Context): Boolean =
    LOCATION_PERMISSIONS.any { ContextCompat.checkSelfPermission(context, it) == PackageManager.PERMISSION_GRANTED }

/** Great-circle distance in metres. */
fun distanceMetres(from: GeoPoint, to: GeoPoint): Double {
    val lat1 = Math.toRadians(from.lat)
    val lat2 = Math.toRadians(to.lat)
    val a = sin((lat2 - lat1) / 2).pow(2) + cos(lat1) * cos(lat2) * sin(Math.toRadians(to.lng - from.lng) / 2).pow(2)
    return 2 * EARTH_RADIUS_M * asin(sqrt(a))
}

/** "350 m" or "1.2 km". */
fun distanceText(metres: Double): String =
    if (metres < METRES_PER_KM) "${metres.roundToInt()} m" else "%.1f km".format(metres / METRES_PER_KM)

/**
 * Reports the device's position every 10 seconds (or 10 metres) while this is on screen and `enabled`; updates stop when
 * the screen goes away, so nothing is tracked in the background.
 */
@SuppressLint("MissingPermission")
@Composable
fun LocationUpdates(enabled: Boolean, onLocation: (GeoPoint) -> Unit) {
    val context = LocalContext.current
    val latest by rememberUpdatedState(onLocation)
    DisposableEffect(enabled) {
        val client = LocationServices.getFusedLocationProviderClient(context)
        val callback = object : LocationCallback() {
            override fun onLocationResult(result: LocationResult) {
                result.lastLocation?.let { latest(GeoPoint(it.latitude, it.longitude)) }
            }
        }
        if (enabled) {
            val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, UPDATE_INTERVAL_MS)
                .setMinUpdateDistanceMeters(MIN_UPDATE_DISTANCE_M)
                .build()
            client.requestLocationUpdates(request, callback, Looper.getMainLooper())
        }
        onDispose { client.removeLocationUpdates(callback) }
    }
}
