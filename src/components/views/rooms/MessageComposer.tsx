/*
Copyright 2015 - 2022 The Matrix.org Foundation C.I.C.

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

import React, { createRef, ReactNode } from "react";
import classNames from "classnames";
import { IEventRelation, MatrixEvent } from "matrix-js-sdk/src/models/event";
import { Room } from "matrix-js-sdk/src/models/room";
import { RoomMember } from "matrix-js-sdk/src/models/room-member";
import { EventType } from "matrix-js-sdk/src/@types/event";
import { THREAD_RELATION_TYPE } from "matrix-js-sdk/src/models/thread";
import { _t } from "../../../languageHandler";
import { MatrixClientPeg } from "../../../MatrixClientPeg";
import dis from "../../../dispatcher/dispatcher";
import { ActionPayload } from "../../../dispatcher/payloads";
import Stickerpicker from "./Stickerpicker";
import { makeRoomPermalink, RoomPermalinkCreator } from "../../../utils/permalinks/Permalinks";
import E2EIcon from "./E2EIcon";
import SettingsStore from "../../../settings/SettingsStore";
import { aboveLeftOf, MenuProps } from "../../structures/ContextMenu";
import AccessibleTooltipButton from "../elements/AccessibleTooltipButton";
import ReplyPreview from "./ReplyPreview";
import ResizeNotifier from "../../../utils/ResizeNotifier";
import { E2EStatus } from "../../../utils/ShieldUtils";
import SendMessageComposer, { SendMessageComposer as SendMessageComposerClass } from "./SendMessageComposer";
import { ComposerInsertPayload } from "../../../dispatcher/payloads/ComposerInsertPayload";
import { Action } from "../../../dispatcher/actions";
import EditorModel from "../../../editor/model";
import UIStore, { UI_EVENTS } from "../../../stores/UIStore";
import RoomContext from "../../../contexts/RoomContext";
import { SettingUpdatedPayload } from "../../../dispatcher/payloads/SettingUpdatedPayload";
import MessageComposerButtons from "./MessageComposerButtons";
import { ButtonEvent } from "../elements/AccessibleButton";
import { ViewRoomPayload } from "../../../dispatcher/payloads/ViewRoomPayload";
import { isLocalRoom } from "../../../utils/localRoom/isLocalRoom";
import { SendWysiwygComposer, sendMessage, getConversionFunctions } from "./wysiwyg_composer/";
import { MatrixClientProps, withMatrixClientHOC } from "../../../contexts/MatrixClientContext";
import { SdkContextClass } from "../../../contexts/SDKContext";
import { UIFeature } from "../../../settings/UIFeature";

let instanceCount = 0;

interface ISendButtonProps {
    onClick: (ev: ButtonEvent) => void;
    title?: string; // defaults to something generic
}

function SendButton(props: ISendButtonProps): JSX.Element {
    return (
        <AccessibleTooltipButton
            className="mx_MessageComposer_sendMessage"
            onClick={props.onClick}
            title={props.title ?? _t("Send message")}
            data-testid="sendmessagebtn"
        />
    );
}

interface IProps extends MatrixClientProps {
    room: Room;
    resizeNotifier: ResizeNotifier;
    permalinkCreator?: RoomPermalinkCreator;
    replyToEvent?: MatrixEvent;
    relation?: IEventRelation;
    e2eStatus?: E2EStatus;
    compact?: boolean;
}

interface IState {
    composerContent: string;
    isComposerEmpty: boolean;
    me?: RoomMember;
    isMenuOpen: boolean;
    isStickerPickerOpen: boolean;
    showStickersButton: boolean;
    showPollsButton: boolean;
    isWysiwygLabEnabled: boolean;
    isRichTextEnabled: boolean;
    initialComposerContent: string;
}

export class MessageComposer extends React.Component<IProps, IState> {
    private tooltipId = `mx_MessageComposer_${Math.random()}`;
    private dispatcherRef?: string;
    private messageComposerInput = createRef<SendMessageComposerClass>();
    private ref: React.RefObject<HTMLDivElement> = createRef();
    private instanceId: number;

    public static contextType = RoomContext;
    public context!: React.ContextType<typeof RoomContext>;

    public static defaultProps = {
        compact: false,
        showVoiceBroadcastButton: false,
        isRichTextEnabled: true,
    };

    public constructor(props: IProps) {
        super(props);

        this.state = {
            isComposerEmpty: true,
            composerContent: "",
            isMenuOpen: false,
            isStickerPickerOpen: false,
            showStickersButton: SettingsStore.getValue("MessageComposerInput.showStickersButton"),
            showPollsButton: SettingsStore.getValue("MessageComposerInput.showPollsButton"),
            isWysiwygLabEnabled: SettingsStore.getValue<boolean>("feature_wysiwyg_composer"),
            isRichTextEnabled: true,
            initialComposerContent: "",
        };

        this.instanceId = instanceCount++;

        SettingsStore.monitorSetting("MessageComposerInput.showStickersButton", null);
        SettingsStore.monitorSetting("MessageComposerInput.showPollsButton", null);
        SettingsStore.monitorSetting("feature_wysiwyg_composer", null);
    }

    public componentDidMount(): void {
        this.dispatcherRef = dis.register(this.onAction);
        this.waitForOwnMember();
        UIStore.instance.trackElementDimensions(`MessageComposer${this.instanceId}`, this.ref.current!);
        UIStore.instance.on(`MessageComposer${this.instanceId}`, this.onResize);
    }

    private onResize = (type: UI_EVENTS, entry: ResizeObserverEntry): void => {
        if (type === UI_EVENTS.Resize) {
            const { narrow } = this.context;
            this.setState({
                isMenuOpen: !narrow ? false : this.state.isMenuOpen,
                isStickerPickerOpen: false,
            });
        }
    };

    private onAction = (payload: ActionPayload): void => {
        switch (payload.action) {
            case "reply_to_event":
                if (payload.context === this.context.timelineRenderingType) {
                    // add a timeout for the reply preview to be rendered, so
                    // that the ScrollPanel listening to the resizeNotifier can
                    // correctly measure it's new height and scroll down to keep
                    // at the bottom if it already is
                    window.setTimeout(() => {
                        this.props.resizeNotifier.notifyTimelineHeightChanged();
                    }, 100);
                }
                break;

            case Action.SettingUpdated: {
                const settingUpdatedPayload = payload as SettingUpdatedPayload;
                switch (settingUpdatedPayload.settingName) {
                    case "MessageComposerInput.showStickersButton": {
                        const showStickersButton = SettingsStore.getValue("MessageComposerInput.showStickersButton");
                        if (this.state.showStickersButton !== showStickersButton) {
                            this.setState({ showStickersButton });
                        }
                        break;
                    }
                    case "MessageComposerInput.showPollsButton": {
                        const showPollsButton = SettingsStore.getValue("MessageComposerInput.showPollsButton");
                        if (this.state.showPollsButton !== showPollsButton) {
                            this.setState({ showPollsButton });
                        }
                        break;
                    }
                    case "feature_wysiwyg_composer": {
                        if (this.state.isWysiwygLabEnabled !== settingUpdatedPayload.newValue) {
                            this.setState({ isWysiwygLabEnabled: Boolean(settingUpdatedPayload.newValue) });
                        }
                        break;
                    }
                }
            }
        }
    };

    private waitForOwnMember(): void {
        // If we have the member already, do that
        const me = this.props.room.getMember(MatrixClientPeg.safeGet().getUserId()!);
        if (me) {
            this.setState({ me });
            return;
        }
        // Otherwise, wait for member loading to finish and then update the member for the avatar.
        // The members should already be loading, and loadMembersIfNeeded
        // will return the promise for the existing operation
        this.props.room.loadMembersIfNeeded().then(() => {
            const me = this.props.room.getMember(MatrixClientPeg.safeGet().getSafeUserId()) ?? undefined;
            this.setState({ me });
        });
    }

    public componentWillUnmount(): void {
        if (this.dispatcherRef) dis.unregister(this.dispatcherRef);
        UIStore.instance.stopTrackingElementDimensions(`MessageComposer${this.instanceId}`);
        UIStore.instance.removeListener(`MessageComposer${this.instanceId}`, this.onResize);
    }

    private onTombstoneClick = (ev: ButtonEvent): void => {
        ev.preventDefault();

        const replacementRoomId = this.context.tombstone?.getContent()["replacement_room"];
        const replacementRoom = MatrixClientPeg.safeGet().getRoom(replacementRoomId);
        let createEventId: string | undefined;
        if (replacementRoom) {
            const createEvent = replacementRoom.currentState.getStateEvents(EventType.RoomCreate, "");
            if (createEvent?.getId()) createEventId = createEvent.getId();
        }

        const sender = this.context.tombstone?.getSender();
        const viaServers = sender ? [sender.split(":").slice(1).join(":")] : undefined;

        dis.dispatch<ViewRoomPayload>({
            action: Action.ViewRoom,
            highlighted: true,
            event_id: createEventId,
            room_id: replacementRoomId,
            auto_join: true,
            // Try to join via the server that sent the event. This converts @something:example.org
            // into a server domain by splitting on colons and ignoring the first entry ("@something").
            via_servers: viaServers,
            metricsTrigger: "Tombstone",
            metricsViaKeyboard: ev.type !== "click",
        });
    };

    private renderPlaceholderText = (): string => {
        if (this.props.replyToEvent) {
            const replyingToThread = this.props.relation?.rel_type === THREAD_RELATION_TYPE.name;
            if (replyingToThread && this.props.e2eStatus) {
                return _t("Reply to encrypted thread…");
            } else if (replyingToThread) {
                return _t("Reply to thread…");
            } else if (this.props.e2eStatus) {
                return _t("Send an encrypted reply…");
            } else {
                return _t("Send a reply…");
            }
        } else {
            if (this.props.e2eStatus) {
                return _t("Send an encrypted message…");
            } else {
                return _t("Send a message…");
            }
        }
    };

    private addEmoji = (emoji: string): boolean => {
        dis.dispatch<ComposerInsertPayload>({
            action: Action.ComposerInsert,
            text: emoji,
            timelineRenderingType: this.context.timelineRenderingType,
        });
        return true;
    };

    private sendMessage = async (): Promise<void> => {
        this.messageComposerInput.current?.sendMessage();

        if (this.state.isWysiwygLabEnabled) {
            const { permalinkCreator, relation, replyToEvent } = this.props;
            const composerContent = this.state.composerContent;
            this.setState({ composerContent: "", initialComposerContent: "" });
            dis.dispatch({
                action: Action.ClearAndFocusSendMessageComposer,
                timelineRenderingType: this.context.timelineRenderingType,
            });
            await sendMessage(composerContent, this.state.isRichTextEnabled, {
                mxClient: this.props.mxClient,
                roomContext: this.context,
                permalinkCreator,
                relation,
                replyToEvent,
            });
        }
    };

    private onChange = (model: EditorModel): void => {
        this.setState({
            isComposerEmpty: model.isEmpty,
        });
    };

    private onWysiwygChange = (content: string): void => {
        this.setState({
            composerContent: content,
            isComposerEmpty: content?.length === 0,
        });
    };

    private onRichTextToggle = async (): Promise<void> => {
        const { richToPlain, plainToRich } = await getConversionFunctions();

        const { isRichTextEnabled, composerContent } = this.state;
        const convertedContent = isRichTextEnabled
            ? await richToPlain(composerContent)
            : await plainToRich(composerContent);

        this.setState({
            isRichTextEnabled: !isRichTextEnabled,
            composerContent: convertedContent,
            initialComposerContent: convertedContent,
        });
    };

    private setStickerPickerOpen = (isStickerPickerOpen: boolean): void => {
        this.setState({
            isStickerPickerOpen,
            isMenuOpen: false,
        });
    };

    private toggleStickerPickerOpen = (): void => {
        this.setStickerPickerOpen(!this.state.isStickerPickerOpen);
    };

    private toggleButtonMenu = (): void => {
        this.setState({
            isMenuOpen: !this.state.isMenuOpen,
        });
    };

    private get showStickersButton(): boolean {
        return this.state.showStickersButton && !isLocalRoom(this.props.room);
    }

    private getMenuPosition(): MenuProps | undefined {
        if (this.ref.current) {
            const hasFormattingButtons = this.state.isWysiwygLabEnabled && this.state.isRichTextEnabled;
            const contentRect = this.ref.current.getBoundingClientRect();
            // Here we need to remove the all the extra space above the editor
            // Instead of doing a querySelector or pass a ref to find the compute the height formatting buttons
            // We are using an arbitrary value, the formatting buttons height doesn't change during the lifecycle of the component
            // It's easier to just use a constant here instead of an over-engineering way to find the height
            const heightToRemove = hasFormattingButtons ? 36 : 0;
            const fixedRect = new DOMRect(
                contentRect.x,
                contentRect.y + heightToRemove,
                contentRect.width,
                contentRect.height - heightToRemove,
            );
            return aboveLeftOf(fixedRect);
        }
    }

    public render(): React.ReactNode {
        const hasE2EIcon = Boolean(!this.state.isWysiwygLabEnabled && this.props.e2eStatus);
        const e2eIcon = hasE2EIcon && (
            <E2EIcon key="e2eIcon" status={this.props.e2eStatus!} className="mx_MessageComposer_e2eIcon" />
        );

        const controls: ReactNode[] = [];
        const menuPosition = this.getMenuPosition();

        const canSendMessages = this.context.canSendMessages && !this.context.tombstone;
        let composer: ReactNode;
        if (canSendMessages) {
            if (this.state.isWysiwygLabEnabled && menuPosition) {
                composer = (
                    <SendWysiwygComposer
                        key="controls_input"
                        onChange={this.onWysiwygChange}
                        onSend={this.sendMessage}
                        isRichTextEnabled={this.state.isRichTextEnabled}
                        initialContent={this.state.initialComposerContent}
                        e2eStatus={this.props.e2eStatus}
                        menuPosition={menuPosition}
                        placeholder={this.renderPlaceholderText()}
                        eventRelation={this.props.relation}
                    />
                );
            } else {
                composer = (
                    <SendMessageComposer
                        ref={this.messageComposerInput}
                        key="controls_input"
                        room={this.props.room}
                        placeholder={this.renderPlaceholderText()}
                        permalinkCreator={this.props.permalinkCreator}
                        relation={this.props.relation}
                        replyToEvent={this.props.replyToEvent}
                        onChange={this.onChange}
                        toggleStickerPickerOpen={this.toggleStickerPickerOpen}
                    />
                );
            }
        } else if (this.context.tombstone) {
            const replacementRoomId = this.context.tombstone.getContent()["replacement_room"];

            const continuesLink = replacementRoomId ? (
                <a
                    href={makeRoomPermalink(MatrixClientPeg.safeGet(), replacementRoomId)}
                    className="mx_MessageComposer_roomReplaced_link"
                    onClick={this.onTombstoneClick}
                >
                    {_t("The conversation continues here.")}
                </a>
            ) : (
                ""
            );

            controls.push(
                <div className="mx_MessageComposer_replaced_wrapper" key="room_replaced">
                    <div className="mx_MessageComposer_replaced_valign">
                        <img
                            aria-hidden
                            alt=""
                            className="mx_MessageComposer_roomReplaced_icon"
                            src={require("../../../../res/img/room_replaced.svg").default}
                        />
                        <span className="mx_MessageComposer_roomReplaced_header">
                            {_t("This room has been replaced and is no longer active.")}
                        </span>
                        <br />
                        {continuesLink}
                    </div>
                </div>,
            );
        } else {
            controls.push(
                <div key="controls_error" className="mx_MessageComposer_noperm_error">
                    {_t("You do not have permission to post to this room")}
                </div>,
            );
        }       

        const threadId =
            this.props.relation?.rel_type === THREAD_RELATION_TYPE.name ? this.props.relation.event_id : null;

        controls.push(
            <Stickerpicker
                room={this.props.room}
                threadId={threadId}
                isStickerPickerOpen={this.state.isStickerPickerOpen}
                setStickerPickerOpen={this.setStickerPickerOpen}
                menuPosition={menuPosition}
                key="stickers"
            />,
        );

        const showSendButton = !this.state.isComposerEmpty;

        const classes = classNames({
            "mx_MessageComposer": true,
            "mx_MessageComposer--compact": this.props.compact,
            "mx_MessageComposer_e2eStatus": hasE2EIcon,
            "mx_MessageComposer_wysiwyg": this.state.isWysiwygLabEnabled,
        });

        return (
            <div
                className={classes}
                ref={this.ref}
            >
                <div className="mx_MessageComposer_wrapper">
                    <ReplyPreview
                        replyToEvent={this.props.replyToEvent}
                        permalinkCreator={this.props.permalinkCreator}
                    />
                    <div className="mx_MessageComposer_row">
                        {e2eIcon}
                        {composer}
                        <div className="mx_MessageComposer_actions">
                            {controls}
                            {canSendMessages && (
                                <MessageComposerButtons
                                    addEmoji={this.addEmoji}
                                    isMenuOpen={this.state.isMenuOpen}
                                    isStickerPickerOpen={this.state.isStickerPickerOpen}
                                    menuPosition={menuPosition}
                                    relation={this.props.relation}
                                    setStickerPickerOpen={this.setStickerPickerOpen}
                                    showLocationButton={
                                        !window.electron && SettingsStore.getValue(UIFeature.LocationSharing)
                                    }
                                    showPollsButton={this.state.showPollsButton}
                                    showStickersButton={this.showStickersButton}
                                    isRichTextEnabled={this.state.isRichTextEnabled}
                                    onComposerModeClick={this.onRichTextToggle}
                                    toggleButtonMenu={this.toggleButtonMenu}
                                />
                            )}
                            {showSendButton && (
                                <SendButton
                                    key="controls_send"
                                    onClick={this.sendMessage}
                                />
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

const MessageComposerWithMatrixClient = withMatrixClientHOC(MessageComposer);
export default MessageComposerWithMatrixClient;
