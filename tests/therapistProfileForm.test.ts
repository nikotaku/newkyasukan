import assert from "node:assert/strict";
import test from "node:test";

import {
  castPatchFromProfile,
  cleanProfileValues,
  currentProfileValues,
  profileDiff,
  therapistProfileFormUrl,
} from "../src/lib/therapistProfileForm.ts";

test("送る前に整える：空を外し、数の欄は数（全角も）にする", () => {
  assert.deepEqual(
    cleanProfileValues({ age: "２４", height: "158cm", bust: "", favorite_food: "  ネギ塩タン ", hobbies: "   " }),
    { age: 24, height: 158, favorite_food: "ネギ塩タン" },
  );
  assert.deepEqual(cleanProfileValues({ age: "abc", waist: 0 }), {});
});

test("casts に入れる形：カップ・コメント・3サイズの古い列もそろえる", () => {
  assert.deepEqual(
    castPatchFromProfile({ bust: 82, waist: "57", hip: 79, cup_size: "D", therapist_comment: "よろしくね" }),
    {
      bust: 82,
      waist: 57,
      hip: 79,
      cup_size: "D",
      therapist_comment: "よろしくね",
      bust_size: "D",
      profile: "よろしくね",
      body_size: "82/57/79",
    },
  );
  assert.equal(castPatchFromProfile({ bust: 82 }).body_size, undefined);
});

test("変わる項目だけ比べる", () => {
  const current = currentProfileValues({ age: 24, bust_size: "D", hobby: "料理", favorite_food: "" });
  assert.equal(current.cup_size, "D");
  assert.equal(current.hobbies, "料理");
  const rows = profileDiff(current, { age: 24, cup_size: "E", hobbies: "料理", favorite_food: "抹茶" });
  assert.deepEqual(rows.map((r) => [r.label, r.before, r.after]), [
    ["カップ", "D", "E"],
    ["好きな食べ物", "", "抹茶"],
  ]);
});

test("本人に送るURL", () => {
  assert.equal(therapistProfileFormUrl("https://example.com", "tok123"), "https://example.com/therapist/tok123?view=profile");
});
