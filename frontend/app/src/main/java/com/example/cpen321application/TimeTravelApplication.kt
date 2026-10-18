package com.example.cpen321application

import android.app.Application
import com.example.cpen321application.data.AppContainer

class TimeTravelApplication : Application() {
    val container: AppContainer by lazy { AppContainer(this) }
}
