# Cortex 1.7.8 Release Notes

Date: 2026-08-26  
Target: independent Cortex HTML

## Legacy ZIP import correction

- Fixed the package-import failure shown by iOS Safari as `Attempted to assign to readonly property.`
- The importer now treats an event end time as mutable while resolving a time window that crosses midnight.
- A window such as `23:50–00:10` advances into the following day instead of aborting package validation.
- The imported story remains isolated from the two built-in stories and retains the Cortex 1.7.7 disclosure and first-appearance image protections.

## Verification

- Reproduced the original failure with the supplied 5.9MB `크로노스 코어_ScenarioPack_v1.5 (1).zip` before the correction.
- Parsed the same package after the correction: 24 events, 10 characters, and 4 built-in images.
- Registered and normalized the imported story successfully under its independent story ID.
- Added a permanent cross-midnight ScenarioPack regression fixture.
- Targeted Cortex HTML suite passed: 57/57.
- Full project suite passed: 515 unit tests and 57 rendered Cortex checks.
- The deterministic 20-turn replay passed every assertion.
- No 100/200-run simulation is performed.

## Compatibility

- Cortex 1.7.7 device state migrates into the 1.7.8 store.
- Device-local API-key storage is unchanged.
- Relay and built-in Chronos story content is unchanged.
- Dancheong's legacy writing engine is unchanged.
