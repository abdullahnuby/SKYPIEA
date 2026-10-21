'use strict';
const {spawnSync}=require('node:child_process');const path=require('node:path');const root=path.resolve(__dirname,'..');
const suites=[
 ['frozen-engine.test.cjs','tests/frozen-engine.test.cjs'],
 ['frozen-takeoff.test.cjs','tests/frozen-takeoff.test.cjs'],
 ['frozen-project-models.test.cjs','tests/frozen-project-models.test.cjs'],
 ['frozen-conversation-agent.test.cjs','tests/frozen-conversation-agent.test.cjs'],
 ['frozen-workflow-engine.test.cjs','tests/frozen-workflow-engine.test.cjs'],
 ['frozen-integrity.test.cjs','tests/frozen-integrity.test.cjs'],
 ['api.test.cjs','tests/api.test.cjs'],
 ['language.test.cjs','tests/language.test.cjs'],
 ['beno-agent.test.cjs','tests/beno-agent.test.cjs'],
 ['beno-context.test.cjs','tests/beno-context.test.cjs'],
 ['beno-explain.test.cjs','tests/beno-explain.test.cjs'],
 ['beno-learning.test.cjs','tests/beno-learning.test.cjs'],
 ['unified-project.test.cjs','tests/unified-project.test.cjs'],
 ['admin.test.cjs','tests/admin.test.cjs'],
 ['catalog-quality.test.cjs','tests/catalog-quality.test.cjs'],
 ['boq-organization.test.cjs','tests/boq-organization.test.cjs'],
 ['agent-knowledge.test.cjs','tests/agent-knowledge.test.cjs'],
 ['http-security.test.cjs','tests/http-security.test.cjs']
];let failed=0;
for(const [label,file] of suites){process.stdout.write(`\n=== ${label} ===\n`);const out=spawnSync(process.execPath,[path.join(root,file)],{cwd:root,encoding:'utf8',env:process.env});if(out.stdout)process.stdout.write(out.stdout);if(out.stderr)process.stderr.write(out.stderr);if(out.status!==0){failed++;process.stderr.write(`FAILED: ${label} (exit ${out.status})\n`);}}
if(failed){process.stderr.write(`\n${failed}/${suites.length} test suites failed.\n`);process.exitCode=1;}else console.log(`\nAll ${suites.length} automated Node test suites passed.`);
