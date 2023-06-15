/*
Copyright 2015, 2016 OpenMarket Ltd
Copyright 2019, 2021 The Matrix.org Foundation C.I.C.

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
import classNames from "classnames";
import { throttle } from "lodash";
import { RoomStateEvent } from "matrix-js-sdk/src/models/room-state";
import { ISearchResults } from "matrix-js-sdk/src/@types/search";

import type { MatrixEvent } from "matrix-js-sdk/src/models/event";
import type { Room } from "matrix-js-sdk/src/models/room";
import { _t } from "../../../languageHandler";
import RoomHeaderButtons from "../right_panel/RoomHeaderButtons";
import E2EIcon from "./E2EIcon";
import DecoratedRoomAvatar from "../avatars/DecoratedRoomAvatar";
import { ButtonEvent } from "../elements/AccessibleButton";
import AccessibleTooltipButton from "../elements/AccessibleTooltipButton";
import RoomTopic from "../elements/RoomTopic";
import RoomName from "../elements/RoomName";
import { E2EStatus } from "../../../utils/ShieldUtils";
import { IOOBData } from "../../../stores/ThreepidInviteStore";
import { SearchScope } from "./SearchBar";
import { aboveLeftOf, ContextMenuTooltipButton, useContextMenu } from "../../structures/ContextMenu";
import RoomContextMenu from "../context_menus/RoomContextMenu";
import { contextMenuBelow } from "./RoomTile";
import { RoomNotificationStateStore } from "../../../stores/notifications/RoomNotificationStateStore";
import { RightPanelPhases } from "../../../stores/right-panel/RightPanelStorePhases";
import { NotificationStateEvents } from "../../../stores/notifications/NotificationState";
import RoomContext from "../../../contexts/RoomContext";
import RoomLiveShareWarning from "../beacon/RoomLiveShareWarning";
import RightPanelStore from "../../../stores/right-panel/RightPanelStore";
import { UPDATE_EVENT } from "../../../stores/AsyncStore";
import { Alignment } from "../elements/Tooltip";
import { shouldShowComponent } from "../../../customisations/helpers/UIComponents";
import { UIComponent } from "../../../settings/UIFeature";

export interface ISearchInfo {
    searchId: number;
    roomId?: string;
    term: string;
    scope: SearchScope;
    promise: Promise<ISearchResults>;
    abortController?: AbortController;

    inProgress?: boolean;
    count?: number;
}

export interface IProps {
    room: Room;
    oobData?: IOOBData;
    inRoom: boolean;
    onSearchClick: (() => void) | null;
    onInviteClick: (() => void) | null;
    onForgetClick: (() => void) | null;
    onAppsClick: (() => void) | null;
    e2eStatus: E2EStatus;
    appsShown: boolean;
    searchInfo?: ISearchInfo;
    excludedRightPanelPhaseButtons?: Array<RightPanelPhases>;
    showButtons?: boolean;
    enableRoomOptionsMenu?: boolean;
}

interface IState {
    contextMenuPosition?: DOMRect;
    rightPanelOpen: boolean;
}

export default class RoomHeader extends React.Component<IProps, IState> {
    public static defaultProps: Partial<IProps> = {
        inRoom: false,
        excludedRightPanelPhaseButtons: [],
        showButtons: true,
        enableRoomOptionsMenu: true,
    };

    public static contextType = RoomContext;
    public context!: React.ContextType<typeof RoomContext>;
    private readonly client = this.props.room.client;

    public constructor(props: IProps, context: IState) {
        super(props, context);
        const notiStore = RoomNotificationStateStore.instance.getRoomState(props.room);
        notiStore.on(NotificationStateEvents.Update, this.onNotificationUpdate);
        this.state = {
            rightPanelOpen: RightPanelStore.instance.isOpen,
        };
    }

    public componentDidMount(): void {
        this.client.on(RoomStateEvent.Events, this.onRoomStateEvents);
        RightPanelStore.instance.on(UPDATE_EVENT, this.onRightPanelStoreUpdate);
    }

    public componentWillUnmount(): void {
        this.client.removeListener(RoomStateEvent.Events, this.onRoomStateEvents);
        const notiStore = RoomNotificationStateStore.instance.getRoomState(this.props.room);
        notiStore.removeListener(NotificationStateEvents.Update, this.onNotificationUpdate);
        RightPanelStore.instance.off(UPDATE_EVENT, this.onRightPanelStoreUpdate);
    }

    private onRightPanelStoreUpdate = (): void => {
        this.setState({ rightPanelOpen: RightPanelStore.instance.isOpen });
    };

    private onRoomStateEvents = (event: MatrixEvent): void => {
        if (!this.props.room || event.getRoomId() !== this.props.room.roomId) {
            return;
        }

        // redisplay the room name, topic, etc.
        this.rateLimitedUpdate();
    };

    private onNotificationUpdate = (): void => {
        this.forceUpdate();
    };

    private rateLimitedUpdate = throttle(
        () => {
            this.forceUpdate();
        },
        500,
        { leading: true, trailing: true },
    );

    private onContextMenuOpenClick = (ev: ButtonEvent): void => {
        ev.preventDefault();
        ev.stopPropagation();
        const target = ev.target as HTMLButtonElement;
        this.setState({ contextMenuPosition: target.getBoundingClientRect() });
    };

    private onContextMenuCloseClick = (): void => {
        this.setState({ contextMenuPosition: undefined });
    };

    private renderButtons(): React.ReactNode {
        const startButtons: JSX.Element[] = [];

        if (this.props.onForgetClick) {
            startButtons.push(
                <AccessibleTooltipButton
                    className="mx_RoomHeader_button mx_RoomHeader_forgetButton"
                    onClick={this.props.onForgetClick}
                    title={_t("Forget room")}
                    alignment={Alignment.Bottom}
                    key="forget"
                />,
            );
        }

        if (this.props.onAppsClick) {
            startButtons.push(
                <AccessibleTooltipButton
                    className={classNames("mx_RoomHeader_button mx_RoomHeader_appsButton", {
                        mx_RoomHeader_appsButton_highlight: this.props.appsShown,
                    })}
                    onClick={this.props.onAppsClick}
                    title={this.props.appsShown ? _t("Hide Widgets") : _t("Show Widgets")}
                    aria-checked={this.props.appsShown}
                    alignment={Alignment.Bottom}
                    key="apps"
                />,
            );
        }

        if (this.props.onSearchClick && this.props.inRoom) {
            startButtons.push(
                <AccessibleTooltipButton
                    className="mx_RoomHeader_button mx_RoomHeader_searchButton"
                    onClick={this.props.onSearchClick}
                    title={_t("Search")}
                    alignment={Alignment.Bottom}
                    key="search"
                />,
            );
        }

        const endButtons: JSX.Element[] = [];

        return (
            <>
                {startButtons}
                <RoomHeaderButtons
                    room={this.props.room}
                    excludedRightPanelPhaseButtons={this.props.excludedRightPanelPhaseButtons}
                />
                {endButtons}
            </>
        );
    }

    private renderName(oobName: string): JSX.Element {
        let contextMenu: JSX.Element | null = null;
        if (this.state.contextMenuPosition && this.props.room) {
            contextMenu = (
                <RoomContextMenu
                    {...contextMenuBelow(this.state.contextMenuPosition)}
                    room={this.props.room}
                    onFinished={this.onContextMenuCloseClick}
                />
            );
        }

        // XXX: this is a bit inefficient - we could just compare room.name for 'Empty room'...
        let settingsHint = false;
        const members = this.props.room ? this.props.room.getJoinedMembers() : undefined;
        if (members) {
            if (members.length === 1 && members[0].userId === this.client.credentials.userId) {
                const nameEvent = this.props.room.currentState.getStateEvents("m.room.name", "");
                if (!nameEvent || !nameEvent.getContent().name) {
                    settingsHint = true;
                }
            }
        }

        const textClasses = classNames("mx_RoomHeader_nametext", { mx_RoomHeader_settingsHint: settingsHint });
        const roomName = (
            <RoomName room={this.props.room}>
                {(name) => {
                    const roomName = name || oobName;
                    return (
                        <div dir="auto" className={textClasses} title={roomName} role="heading" aria-level={1}>
                            {roomName}
                        </div>
                    );
                }}
            </RoomName>
        );

        if (this.props.enableRoomOptionsMenu && shouldShowComponent(UIComponent.RoomOptionsMenu)) {
            return (
                <ContextMenuTooltipButton
                    className="mx_RoomHeader_name"
                    onClick={this.onContextMenuOpenClick}
                    isExpanded={!!this.state.contextMenuPosition}
                    title={_t("Room options")}
                    alignment={Alignment.Bottom}
                >
                    {roomName}
                    {this.props.room && <div className="mx_RoomHeader_chevron" />}
                    {contextMenu}
                </ContextMenuTooltipButton>
            );
        }

        return <div className="mx_RoomHeader_name mx_RoomHeader_name--textonly">{roomName}</div>;
    }

    public render(): React.ReactNode {
        let roomAvatar: JSX.Element | null = null;
        if (this.props.room) {
            roomAvatar = (
                <DecoratedRoomAvatar
                    room={this.props.room}
                    avatarSize={24}
                    oobData={this.props.oobData}
                    viewAvatarOnClick={true}
                />
            );
        }

        const icon = this.props.e2eStatus ? (
            <E2EIcon className="mx_RoomHeader_icon" status={this.props.e2eStatus} tooltipAlignment={Alignment.Bottom} />
        ) : // If we're expecting an E2EE status to come in, but it hasn't
        // yet been loaded, insert a blank div to reserve space
        this.client.isRoomEncrypted(this.props.room.roomId) && this.client.isCryptoEnabled() ? (
            <div className="mx_RoomHeader_icon" />
        ) : null;

        const buttons = this.props.showButtons ? this.renderButtons() : null;

        let oobName = _t("Join Room");
        if (this.props.oobData && this.props.oobData.name) {
            oobName = this.props.oobData.name;
        }

        const name = this.renderName(oobName);

        let searchStatus: JSX.Element | null = null;

        // don't display the search count until the search completes and
        // gives us a valid (possibly zero) searchCount.
        if (typeof this.props.searchInfo?.count === "number") {
            searchStatus = (
                <div className="mx_RoomHeader_searchStatus">
                    &nbsp;
                    {_t("(~%(count)s results)", { count: this.props.searchInfo.count })}
                </div>
            );
        }

        const topicElement = <RoomTopic room={this.props.room} className="mx_RoomHeader_topic" />;

        return (
            <header className="mx_RoomHeader light-panel">
                <div
                    className="mx_RoomHeader_wrapper"
                    aria-owns={this.state.rightPanelOpen ? "mx_RightPanel" : undefined}
                >
                    <div className="mx_RoomHeader_avatar">{roomAvatar}</div>
                    {icon}
                    {name}
                    {searchStatus}
                    {topicElement}
                    {buttons}
                </div>
                <RoomLiveShareWarning roomId={this.props.room.roomId} />
            </header>
        );
    }
}
