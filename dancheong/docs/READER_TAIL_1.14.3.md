# Reader tail control 1.14.3

- The page-end control has its own layout dock immediately above the recommendation strip, so it never covers a recommendation card.
- The control is visible only while the story viewport is more than two pixels above its true end.
- Manual scrolling to the end hides the control immediately without resuming automatic follow mode.
- Clicking the control still moves to the latest prose and explicitly resumes automatic follow mode.
- Regression coverage verifies manual end arrival, preserved follow ownership, and DOM placement above recommendations.
