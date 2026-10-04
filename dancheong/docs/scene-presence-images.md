# Scene image references: single image request

Image generation remains a single image API request. No scene-verification text
request, prose-writer sidecar, extra author instructions or gameplay work is added.

The approved passage is unchanged. The image prompt distinguishes the final current
scene from earlier context. Reference photos are an optional appearance dictionary,
not a mandatory cast list. Letter authors, handwriting owners, remembered or quoted
people and remote voices must not be inserted into the physical scene. Unregistered
people present in the prose remain valid subjects without borrowing another face.

A cheap local reference-candidate filter excludes explicit indirect mentions such
as possessive notes and handwriting attribution. It is deliberately not a complete
natural-language presence classifier. Primary-photo selection, public aliases and
pre-reveal image restrictions remain in force. Package plot/tone summaries and
character biographies are not forwarded as visual instructions.

Version 5 also excludes explicit departures, other-room speakers and named people
remaining in a different room from the final shot. A subsequent explicit arrival
restores their eligibility. Direct co-presence and silent characters still qualify;
dialogue is not a prerequisite. Excluded public names are identified in the image
prompt so an absent person's appearance cannot be offered as a substitute for an
unregistered scene participant. Names are taken from the approved passage, never
from private character biographies. Public alias uniqueness is indexed once per
request and the short final passage is split only once, rather than per character.

Version 6 explicitly binds the actual selected photo index to its public owner,
public aliases and bounded action excerpts from the final paragraph. Excerpts stop
at the next named subject; they do not assign the next person's actions to the
previous photo. A missing photo does not shift the remaining owners' indices.
Names from anchored published dialogue in this beat and at most ten earlier beats
identify unregistered people without inventing character IDs or inheriting stale
annotation IDs. Future turns are not scanned when illustrating an older beat.
Unregistered people receive no borrowed reference face; no past generated scene is
fed back as a purported character portrait.

The image focus is the final paragraph, with an explicit single end-of-paragraph
moment instruction. Earlier prose is no longer forwarded wholesale as a competing
scene. An ending without an explicit named subject action (dialogue, pronouns or
a written list) retains only the immediately preceding paragraph for antecedent
and location context, labelled as context rather than a pose to replay.
Reference eligibility still considers the last two
paragraphs, preserving silent people and dialogue-only endings. Shared audible
voices beyond a barrier are excluded even with possessives or multiple names.
These local hints remain heuristic, not authoritative scene interpretation.

New requests rebuild version-6 capsules. Existing generated images are preserved;
the update does not automatically regenerate them or alter the story. Tests cover
indirect mentions, physical presence, aliases, primary photos, hidden-image policy,
unchanged prose and a single image call with no extra text call. Mocked transport
does not guarantee final generative image quality; no paid image test was run.
Natural-language presence remains heuristic: these are conservative explicit
exclusions, not a promise of perfect scene comprehension or a new story filter.

Regression coverage includes photo/action ownership, missing photos, unregistered
names, earlier-farewell isolation, remote shared voices, actual arrivals, masks,
bounded history, stale-ID rejection and no future-name leakage. The wrapped reader
transport is checked for exactly one image request and unchanged prose. Local
replay of the supplied 40–42 beat backup checks the same invariants without
publishing private prose or test data. No paid generative re-render is performed;
model adherence and arbitrary prose cannot be guaranteed by these tests.
