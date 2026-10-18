package com.example.cpen321application.ui.signin

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.example.cpen321application.ui.common.CompassMark
import com.example.cpen321application.ui.common.TestTags
import com.example.cpen321application.ui.common.Wordmark

@Composable
fun SignInScreen(
    signingIn: Boolean,
    message: String?,
    signInConfigured: Boolean,
    onSignIn: () -> Unit,
) {
    Scaffold { innerPadding ->
        Row(modifier = Modifier.fillMaxSize().padding(innerPadding)) {
            // The dark green edge of the presentation's title slide.
            Box(modifier = Modifier.fillMaxHeight().width(8.dp).background(MaterialTheme.colorScheme.primary))
            Column(
                modifier = Modifier.fillMaxSize().padding(horizontal = 28.dp),
                verticalArrangement = Arrangement.Center,
            ) {
                CompassMark(size = 64.dp)
                Spacer(modifier = Modifier.height(24.dp))
                Wordmark()
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = "Crowd-rated activities, scheduled into a trip that actually fits your days.",
                    style = MaterialTheme.typography.titleMedium.copy(
                        fontFamily = FontFamily.Serif,
                        fontStyle = FontStyle.Italic,
                        fontWeight = FontWeight.Normal,
                    ),
                    color = MaterialTheme.colorScheme.secondary,
                )
                HorizontalDivider(
                    modifier = Modifier.padding(vertical = 28.dp).width(56.dp),
                    thickness = 3.dp,
                    color = MaterialTheme.colorScheme.secondary,
                )
                Button(
                    onClick = onSignIn,
                    enabled = signInConfigured && !signingIn,
                    shape = MaterialTheme.shapes.small,
                    modifier = Modifier.fillMaxWidth().height(52.dp).testTag(TestTags.SIGN_IN_BUTTON),
                ) {
                    if (signingIn) {
                        CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                    } else {
                        Text("Sign in with Google")
                    }
                }
                if (!signInConfigured) {
                    StatusText("GOOGLE_CLIENT_ID is missing from frontend/local.properties.")
                }
                if (message != null) {
                    StatusText(message)
                }
            }
        }
    }
}

@Composable
private fun StatusText(text: String) {
    Text(text = text, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(top = 16.dp))
}
