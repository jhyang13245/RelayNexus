# Cortex 1.7.5 Release Notes

Date: 2026-08-26  
Target: independent Cortex HTML

## iOS viewport correction

- Separated the settings-dialog keyboard offset from the story composer offset.
- The composer is hidden and cannot receive pointer events while a modal dialog is open.
- Closing or cancelling a dialog immediately clears stale keyboard offsets.
- Added bounded viewport resynchronization at 0, 80, 180, and 360 ms to follow iOS keyboard-dismiss animation.
- Kept the composer non-interactive during the short keyboard-dismiss recovery window so visual and touch positions cannot diverge mid-animation.
- Preserved the reading anchor while Safari restores the visual viewport.
- Kept the application layout height stable while using the visual height only for the active dialog.
- Ignored small browser-toolbar movements below 80 px so they cannot be mistaken for an on-screen keyboard.

## Compatibility

- Cortex narrative, canon, time, action, cast, and Continuity Capsule V3 behavior remains unchanged from 1.7.4.
- Existing Cortex 1.7.4 device state migrates into the 1.7.5 store.
- Device-local API key storage remains unchanged.
