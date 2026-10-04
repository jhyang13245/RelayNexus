import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isMobileComposerDevice,
  shouldSubmitComposerOnEnter,
} from "../lib/composer-input";

describe("composer input completion", () => {
  it("PC에서는 Enter만 입력 완료로 처리한다", () => {
    const mobileDevice = isMobileComposerDevice({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
      platform: "Win32",
      maxTouchPoints: 0,
    });

    assert.equal(mobileDevice, false);
    assert.equal(
      shouldSubmitComposerOnEnter({
        key: "Enter",
        shiftKey: false,
        isComposing: false,
        mobileDevice,
      }),
      true,
    );
    assert.equal(
      shouldSubmitComposerOnEnter({
        key: "Enter",
        shiftKey: true,
        isComposing: false,
        mobileDevice,
      }),
      false,
    );
  });

  it("모바일에서는 Enter를 줄바꿈으로 남기고 버튼만 입력 완료로 쓴다", () => {
    for (const navigatorLike of [
      {
        userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148",
        platform: "iPhone",
        maxTouchPoints: 5,
      },
      {
        userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9) Mobile",
        platform: "Linux armv8l",
        maxTouchPoints: 5,
      },
      {
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)",
        platform: "MacIntel",
        maxTouchPoints: 5,
      },
    ]) {
      const mobileDevice = isMobileComposerDevice(navigatorLike);
      assert.equal(mobileDevice, true);
      assert.equal(
        shouldSubmitComposerOnEnter({
          key: "Enter",
          shiftKey: false,
          isComposing: false,
          mobileDevice,
        }),
        false,
      );
    }
  });

  it("한글 조합 확정 Enter는 PC에서도 전송하지 않는다", () => {
    assert.equal(
      shouldSubmitComposerOnEnter({
        key: "Enter",
        shiftKey: false,
        isComposing: true,
        mobileDevice: false,
      }),
      false,
    );
  });
});
