// Copyright StepSecurity.
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import * as core from '@actions/core';
import * as tc from '@actions/tool-cache';
import { getReleaseInfo } from './lib/release';
import { hash } from './lib/checksum';
import fs from 'fs';
import axios, {isAxiosError} from 'axios';

async function validateSubscription() {
  const eventPath = process.env.GITHUB_EVENT_PATH
  let repoPrivate: boolean | undefined

  if (eventPath && fs.existsSync(eventPath)) {
    const eventData = JSON.parse(fs.readFileSync(eventPath, 'utf8'))
    repoPrivate = eventData?.repository?.private
  }

  const upstream = 'oras-project/setup-oras';
  const action = process.env.GITHUB_ACTION_REPOSITORY;
  const docsUrl = 'https://docs.stepsecurity.io/actions/stepsecurity-maintained-actions';

  core.info('');
  core.info('\u001b[1;36mStepSecurity Maintained Action\u001b[0m');
  core.info(`Secure drop-in replacement for ${upstream}`);
  if (repoPrivate === false) core.info('\u001b[32m✓ Free for public repositories\u001b[0m');
  core.info(`\u001b[36mLearn more:\u001b[0m ${docsUrl}`);
  core.info('');

  if (repoPrivate === false) return;

  const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com';
  const body: Record<string, string> = { action: action || '' };
  if (serverUrl !== 'https://github.com') body.ghes_server = serverUrl;
  try {
    await axios.post(
      `https://agent.api.stepsecurity.io/v1/github/${process.env.GITHUB_REPOSITORY}/actions/maintained-actions-subscription`,
      body, { timeout: 3000 }
    );
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 403) {
      core.error(`\u001b[1;31mThis action requires a StepSecurity subscription for private repositories.\u001b[0m`);
      core.error(`\u001b[31mLearn how to enable a subscription: ${docsUrl}\u001b[0m`);
      process.exit(1);
    }
    core.info('Timeout or API not reachable. Continuing to next step.');
  }
}

// setup sets up the ORAS CLI
async function setup(): Promise<void> {
  try {
    await validateSubscription();
    // inputs from user
    const version: string = core.getInput('version');
    const url: string = core.getInput('url');
    const checksum = core.getInput('checksum').toLowerCase();

    // download ORAS CLI and validate checksum
    const info = getReleaseInfo(version, url, checksum);
    const download_url = info.url;
    console.log(`downloading ORAS CLI from ${download_url}`);
    const pathToTarball: string = await tc.downloadTool(download_url);
    console.log("downloading ORAS CLI completed");
    const actual_checksum = await hash(pathToTarball);
    if (actual_checksum !== info.checksum) {
      throw new Error(`checksum of downloaded ORAS CLI ${actual_checksum} does not match expected checksum ${info.checksum}`);
    }
    console.log("successfully verified downloaded release checksum");

    // extract the tarball/zipball onto host runner
    const extract = download_url.endsWith('.zip') ? tc.extractZip : tc.extractTar;
    const pathToCLI: string = await extract(pathToTarball);

    // add `ORAS` to PATH
    core.addPath(pathToCLI);
  } catch (e) {
    if (e instanceof Error) {
      core.setFailed(e);
    } else {
      core.setFailed('unknown error during ORAS setup');
    }
  }
}

export = setup;

if (require.main === module) {
  setup();
}