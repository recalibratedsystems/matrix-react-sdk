/*
Copyright 2022 The Matrix.org Foundation C.I.C.

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

import React from "react";
import { render, screen, act, RenderResult } from "@testing-library/react";
import { mocked, Mocked } from "jest-mock";
import { MatrixClient, PendingEventOrdering } from "matrix-js-sdk/src/client";
import { Room } from "matrix-js-sdk/src/models/room";
import { RoomStateEvent } from "matrix-js-sdk/src/models/room-state";
import { Widget } from "matrix-widget-api";
import { MatrixEvent } from "matrix-js-sdk/src/matrix";
import { Thread } from "matrix-js-sdk/src/models/thread";

import type { RoomMember } from "matrix-js-sdk/src/models/room-member";
import type { ClientWidgetApi } from "matrix-widget-api";
import {
    stubClient,
    mkRoomMember,
    setupAsyncStoreWithClient,
    filterConsole,
    flushPromises,
    mkMessage,
} from "../../../test-utils";
import RoomTile from "../../../../src/components/views/rooms/RoomTile";
import { DefaultTagID } from "../../../../src/stores/room-list/models";
import DMRoomMap from "../../../../src/utils/DMRoomMap";
import PlatformPeg from "../../../../src/PlatformPeg";
import BasePlatform from "../../../../src/BasePlatform";
import { WidgetMessagingStore } from "../../../../src/stores/widgets/WidgetMessagingStore";
import { TestSdkContext } from "../../../TestSdkContext";
import { SDKContext } from "../../../../src/contexts/SDKContext";
import { shouldShowComponent } from "../../../../src/customisations/helpers/UIComponents";
import { UIComponent } from "../../../../src/settings/UIFeature";
import { MessagePreviewStore } from "../../../../src/stores/room-list/MessagePreviewStore";

jest.mock("../../../../src/customisations/helpers/UIComponents", () => ({
    shouldShowComponent: jest.fn(),
}));

describe("RoomTile", () => {
    jest.spyOn(PlatformPeg, "get").mockReturnValue({
        overrideBrowserShortcuts: () => false,
    } as unknown as BasePlatform);

    const renderRoomTile = (): RenderResult => {
        return render(
            <SDKContext.Provider value={sdkContext}>
                <RoomTile
                    room={room}
                    showMessagePreview={showMessagePreview}
                    isMinimized={false}
                    tag={DefaultTagID.Untagged}
                />
            </SDKContext.Provider>,
        );
    };

    let client: Mocked<MatrixClient>;
    let voiceBroadcastInfoEvent: MatrixEvent;
    let room: Room;
    let sdkContext: TestSdkContext;
    let showMessagePreview = false;

    filterConsole(
        // irrelevant for this test
        "Room !1:example.org does not have an m.room.create event",
    );

    const addMessageToRoom = (ts: number) => {
        const message = mkMessage({
            event: true,
            room: room.roomId,
            msg: "test message",
            user: client.getSafeUserId(),
            ts,
        });

        room.timeline.push(message);
    };

    const addThreadMessageToRoom = (ts: number) => {
        const message = mkMessage({
            event: true,
            room: room.roomId,
            msg: "test thread reply",
            user: client.getSafeUserId(),
            ts,
        });

        // Mock thread reply for tests.
        jest.spyOn(room, "getThreads").mockReturnValue([
            // @ts-ignore
            {
                lastReply: () => message,
                timeline: [],
            } as Thread,
        ]);
    };

    beforeEach(() => {
        sdkContext = new TestSdkContext();

        client = mocked(stubClient());
        sdkContext.client = client;
        DMRoomMap.makeShared(client);

        room = new Room("!1:example.org", client, "@alice:example.org", {
            pendingEventOrdering: PendingEventOrdering.Detached,
        });

        client.getRoom.mockImplementation((roomId) => (roomId === room.roomId ? room : null));
        client.getRooms.mockReturnValue([room]);
        client.reEmitter.reEmit(room, [RoomStateEvent.Events]);
    });

    afterEach(() => {
        // @ts-ignore
        MessagePreviewStore.instance.previews = new Map<string, Map<TagID | TAG_ANY, MessagePreview | null>>();
        jest.restoreAllMocks();
    });

    describe("when message previews are not enabled", () => {
        it("should render the room", () => {
            mocked(shouldShowComponent).mockReturnValue(true);
            const renderResult = renderRoomTile();
            expect(renderResult.container).toMatchSnapshot();
        });

        it("does not render the room options context menu when UIComponent customisations disable room options", () => {
            mocked(shouldShowComponent).mockReturnValue(false);
            renderRoomTile();
            expect(shouldShowComponent).toHaveBeenCalledWith(UIComponent.RoomOptionsMenu);
            expect(screen.queryByRole("button", { name: "Room options" })).not.toBeInTheDocument();
        });

        it("renders the room options context menu when UIComponent customisations enable room options", () => {
            mocked(shouldShowComponent).mockReturnValue(true);
            renderRoomTile();
            expect(shouldShowComponent).toHaveBeenCalledWith(UIComponent.RoomOptionsMenu);
            expect(screen.queryByRole("button", { name: "Room options" })).toBeInTheDocument();
        });
    });

    describe("when message previews are enabled", () => {
        beforeEach(() => {
            showMessagePreview = true;
        });

        it("should render a room without a message as expected", async () => {
            const renderResult = renderRoomTile();
            // flush promises here because the preview is created asynchronously
            await flushPromises();
            expect(renderResult.asFragment()).toMatchSnapshot();
        });

        describe("and there is a message in the room", () => {
            beforeEach(() => {
                addMessageToRoom(23);
            });

            it("should render as expected", async () => {
                const renderResult = renderRoomTile();
                expect(await screen.findByText("test message")).toBeInTheDocument();
                expect(renderResult.asFragment()).toMatchSnapshot();
            });
        });

        describe("and there is a message in a thread", () => {
            beforeEach(() => {
                addThreadMessageToRoom(23);
            });

            it("should render as expected", async () => {
                const renderResult = renderRoomTile();
                expect(await screen.findByText("test thread reply")).toBeInTheDocument();
                expect(renderResult.asFragment()).toMatchSnapshot();
            });
        });

        describe("and there is a message and a thread without a reply", () => {
            beforeEach(() => {
                addMessageToRoom(23);

                // Mock thread reply for tests.
                jest.spyOn(room, "getThreads").mockReturnValue([
                    // @ts-ignore
                    {
                        lastReply: () => null,
                        timeline: [],
                    } as Thread,
                ]);
            });

            it("should render the message preview", async () => {
                renderRoomTile();
                expect(await screen.findByText("test message")).toBeInTheDocument();
            });
        });
    });
});
