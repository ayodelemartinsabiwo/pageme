package com.pageme.app;

import static org.junit.Assert.assertNotNull;

import org.junit.Test;

public class FirebaseRuntimeDependencyTest {
    @Test
    public void firebaseDataStoreDelegateIsPackaged() throws Exception {
        assertNotNull(Class.forName(
            "androidx.datastore.preferences.PreferenceDataStoreDelegateKt"));
    }
}
