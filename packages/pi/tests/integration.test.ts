/// <reference types="bun" />

// Bun discovers *.test.ts files. This manifest keeps module-level integration
// suites named *.integration.ts while registering them in the default test run.
import './extensions/index.integration';
import './skills-catalog.integration';
import './review/review-backend.integration';
import './setup.integration';
import './tools/review.integration';
import './vcs/github.integration';
import './vcs/gitlab.integration';
