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

import React, { FC, MutableRefObject, useCallback, useMemo } from "react";
import { Room, RoomEvent } from "matrix-js-sdk/src/models/room";

import PersistentApp from "../elements/PersistentApp";
import defaultDispatcher from "../../../dispatcher/dispatcher";
import { ViewRoomPayload } from "../../../dispatcher/payloads/ViewRoomPayload";
import { Action } from "../../../dispatcher/actions";
import WidgetStore from "../../../stores/WidgetStore";
import { Container, WidgetLayoutStore } from "../../../stores/widgets/WidgetLayoutStore";
import { useTypedEventEmitterState } from "../../../hooks/useEventEmitter";
import Toolbar from "../../../accessibility/Toolbar";
import { RovingAccessibleButton } from "../../../accessibility/RovingTabIndex";
import { Icon as BackIcon } from "../../../../res/img/element-icons/back.svg";
import { _t } from "../../../languageHandler";

interface Props {
    widgetId: string;
    room: Room;
    viewingRoom: boolean;
    onStartMoving: (e: React.MouseEvent<Element, MouseEvent>) => void;
    movePersistedElement: MutableRefObject<(() => void) | undefined>;
}

/**
 * A picture-in-picture view for a widget. Additional controls are shown if the
 * widget is a call of some sort.
 */
export const WidgetPip: FC<Props> = ({ widgetId, room, viewingRoom, onStartMoving, movePersistedElement }) => {
    const widget = useMemo(
        () => WidgetStore.instance.getApps(room.roomId).find((app) => app.id === widgetId)!,
        [room, widgetId],
    );

    const roomName = useTypedEventEmitterState(
        room,
        RoomEvent.Name,
        useCallback(() => room.name, [room]),
    );

    const onBackClick = useCallback(
        (ev) => {
            ev.preventDefault();
            ev.stopPropagation();

            if (viewingRoom) {
                WidgetLayoutStore.instance.moveToContainer(room, widget, Container.Center);
            } else {
                defaultDispatcher.dispatch<ViewRoomPayload>({
                    action: Action.ViewRoom,
                    room_id: room.roomId,
                    metricsTrigger: "WebFloatingCallWindow",
                });
            }
        },
        [room, widget, viewingRoom],
    );

    return (
        <div className="mx_WidgetPip" onMouseDown={onStartMoving} onClick={onBackClick}>
            <Toolbar className="mx_WidgetPip_header">
                <RovingAccessibleButton
                    onClick={onBackClick}
                    className="mx_WidgetPip_backButton"
                    aria-label={_t("Back")}
                >
                    <BackIcon className="mx_Icon mx_Icon_16" />
                    {roomName}
                </RovingAccessibleButton>
            </Toolbar>
            <PersistentApp
                persistentWidgetId={widgetId}
                persistentRoomId={room.roomId}
                pointerEvents="none"
                movePersistedElement={movePersistedElement}
            />
        </div>
    );
};
