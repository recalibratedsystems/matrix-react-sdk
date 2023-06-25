/*
Copyright 2021 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { logger } from "matrix-js-sdk/src/logger";

import { MatrixClientPeg } from "../MatrixClientPeg";
import WidgetUtils from "../utils/WidgetUtils";

export function isManagedHybridWidgetEnabled(roomId: string): boolean {
    return false;
}

export async function addManagedHybridWidget(roomId: string): Promise<void> {
    const cli = MatrixClientPeg.safeGet();
    const room = cli.getRoom(roomId);
    if (!room) {
        return;
    }

    // Check for permission
    if (!WidgetUtils.canUserModifyWidgets(cli, roomId)) {
        logger.error(`User not allowed to modify widgets in ${roomId}`);
        return;
    }

    // Get widget data
    /* eslint-disable-next-line camelcase */
    return;
}
