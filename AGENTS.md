# Repository Instructions

## Skills

Use an upstream skill when its maintainer provides one. Install first-party skills with `npx skills add`; do not copy or wrap them in this package.

When a skill needs user input, call `ask_user_question` from `npm:@juicesharp/rpiv-ask-user-question`. Do not implement another questionnaire or ask the question as plain chat text.
