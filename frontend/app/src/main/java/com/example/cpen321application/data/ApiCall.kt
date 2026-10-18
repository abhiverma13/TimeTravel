package com.example.cpen321application.data

import com.google.gson.Gson
import com.google.gson.JsonParseException
import java.io.IOException
import retrofit2.HttpException

/** A failed back-end call, with a message that can be shown to the traveller as-is. */
class ApiException(message: String, val status: Int?) : Exception(message)

private const val NETWORK_ERROR_MESSAGE = "Couldn't reach TimeTravel. Check your connection and try again."
private const val UNEXPECTED_RESPONSE_MESSAGE = "TimeTravel sent an unexpected response. Please try again."

private val gson = Gson()

/** Runs a Retrofit call, turning HTTP, network and parsing failures into an [ApiException] result. */
internal suspend fun <T> apiCall(call: suspend () -> T): Result<T> = try {
    Result.success(call())
} catch (error: HttpException) {
    Result.failure(ApiException(messageFor(error), error.code()))
} catch (expected: IOException) {
    Result.failure(ApiException(NETWORK_ERROR_MESSAGE, null))
} catch (expected: JsonParseException) {
    Result.failure(ApiException(UNEXPECTED_RESPONSE_MESSAGE, null))
}

// The back-end's `{ error, details }` message, or a generic one if the body is not in that shape.
private fun messageFor(error: HttpException): String {
    val body = error.response()?.errorBody()?.string()
    val parsed = body?.let { json -> runCatching { gson.fromJson(json, ErrorResponse::class.java) }.getOrNull() }
    val message = parsed?.error
    val details = parsed?.details.orEmpty().joinToString("; ")
    return when {
        message == null -> "Something went wrong (HTTP ${error.code()}). Please try again."
        details.isEmpty() -> message
        else -> "$message: $details"
    }
}
