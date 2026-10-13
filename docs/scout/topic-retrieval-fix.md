# Scout topic and discovery correction

The stored TikTok pilot exposed two independent defects. Assessment revision 7 returned topic `unknown` for unverified profiles, but the review editor converted the boolean `relevant: false` into “Off-Topic”. Separately, the experimental executor merged every provider hit into its candidate pool, letting unrelated profile search hits consume quota and appear in review. Query text and a discovery method label are not observed evidence.

Changes:
- Preserve unknown topic state in the editor and on restoration. Off-topic warnings require a failed assessment or an explicit reviewer selection.
- Admit experimental leads only with observed topic hints, supporting owned content, trusted role sources, or seed/public connections. Names are retrieval hints only, never qualification evidence. Real owned media from content discovery can be analyzed even without captions.
- Audit discarded discovery hits separately; they do not consume enrichment quota or count toward discovery progress. Saved experimental results apply the same presentation rule without rewriting source decisions or running providers.
- Recognize explicit badminton sport phrases in compact Vietnamese hashtags. This does not independently establish identity, geography, or qualification.
- Keep Qualified as the default view, including zero-result sessions.

Regression fixtures use the reported unrelated teacher, US lifestyle, Texas wildlife, and home-design examples, plus caption-only badminton and captionless media leads. Existing role/content, size, geography, review, and import requirements remain in force. No live provider/model runs are needed for this correction. A historical false exclusion from an older assessment is not automatically rewritten into a match.
