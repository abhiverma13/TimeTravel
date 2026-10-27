package com.example.cpen321application.data

import java.util.concurrent.TimeUnit
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory

object ApiClient {
    private const val CONNECT_TIMEOUT_SECONDS = 10L
    // Itinerary generation can take a few seconds on a cold catalogue.
    private const val READ_TIMEOUT_SECONDS = 30L

    /** Builds the Retrofit client every API interface shares; each request carries the stored session token. */
    fun create(baseUrl: String, sessionStore: SessionStore): Retrofit {
        val authorization = Interceptor { chain ->
            val token = sessionStore.token
            val request = if (token == null) {
                chain.request()
            } else {
                chain.request().newBuilder().header("Authorization", "Bearer $token").build()
            }
            chain.proceed(request)
        }
        val client = OkHttpClient.Builder()
            .addInterceptor(authorization)
            .connectTimeout(CONNECT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .readTimeout(READ_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .build()
        return Retrofit.Builder()
            .baseUrl(baseUrl.trimEnd('/') + "/")
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
    }
}
