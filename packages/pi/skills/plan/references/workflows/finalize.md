# finalize

1. Call `plan_context`, then `plan_annotations`. Apply pending comments through the update workflow before finalization.
2. Call `plan_validate` with `strict: true`. Stop on errors, pending annotations, or Design above 800 words.
3. Mark the draft ready with `plan_update_status`.
4. Use one `ask_user_question` call to choose the next action and, when executing now, commit policy. Choices are inline execution, background execution, execute later, or continue planning; commit policy is commit per phase or no commits.
5. For execute later or continue planning, do not ask for or apply a commit policy. Call `diffpi_modes_unset` before returning so finalization exits to the default inline mode. Otherwise call `plan_start_execution` with the selected mode and policy.
