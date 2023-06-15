/*
Copyright 2019 - 2023 The Matrix.org Foundation C.I.C.

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
import { logger } from "matrix-js-sdk/src/logger";

import AccessibleButton from "../../../elements/AccessibleButton";
import { _t, getCurrentLanguage } from "../../../../../languageHandler";
import SdkConfig from "../../../../../SdkConfig";
import createRoom from "../../../../../createRoom";
import PlatformPeg from "../../../../../PlatformPeg";
import CopyableText from "../../../elements/CopyableText";
import SettingsTab from "../SettingsTab";
import { SettingsSection } from "../../shared/SettingsSection";
import SettingsSubsection, { SettingsSubsectionText } from "../../shared/SettingsSubsection";
import ExternalLink from "../../../elements/ExternalLink";
import MatrixClientContext from "../../../../../contexts/MatrixClientContext";

interface IProps {
    closeSettingsFn: () => void;
}

interface IState {
    appVersion: string | null;
    canUpdate: boolean;
}

export default class HelpUserSettingsTab extends React.Component<IProps, IState> {
    public static contextType = MatrixClientContext;
    public context!: React.ContextType<typeof MatrixClientContext>;

    public constructor(props: IProps) {
        super(props);

        this.state = {
            appVersion: null,
            canUpdate: false,
        };
    }

    public componentDidMount(): void {
        PlatformPeg.get()
            ?.getAppVersion()
            .then((ver) => this.setState({ appVersion: ver }))
            .catch((e) => {
                logger.error("Error getting vector version: ", e);
            });
        PlatformPeg.get()
            ?.canSelfUpdate()
            .then((v) => this.setState({ canUpdate: v }))
            .catch((e) => {
                logger.error("Error getting self updatability: ", e);
            });
    }

    private onClearCacheAndReload = (): void => {
        if (!PlatformPeg.get()) return;

        // Dev note: please keep this log line, it's useful when troubleshooting a MatrixClient suddenly
        // stopping in the middle of the logs.
        logger.log("Clear cache & reload clicked");
        this.context.stopClient();
        this.context.store.deleteAllData().then(() => {
            PlatformPeg.get()?.reload();
        });
    };

    public render(): React.ReactNode {
        const brand = SdkConfig.get().brand;

        let faqText = _t(
            "For help with using %(brand)s, click <a>here</a>.",
            {
                brand,
            },
            {
                a: (sub) => <ExternalLink href={SdkConfig.get("help_url")}>{sub}</ExternalLink>,
            },
        );

        return (
            <SettingsTab>
                <SettingsSection heading={_t("Help & About")}>
                    <SettingsSubsection heading={_t("Advanced")}>
                        <SettingsSubsectionText>
                            <details>
                                <summary>{_t("Access Token")}</summary>
                                <b>
                                    {_t(
                                        "Your access token gives full access to your account." +
                                            " Do not share it with anyone.",
                                    )}
                                </b>
                                <CopyableText getTextToCopy={() => this.context.getAccessToken()}>
                                    {this.context.getAccessToken()}
                                </CopyableText>
                            </details>
                        </SettingsSubsectionText>
                        <AccessibleButton onClick={this.onClearCacheAndReload} kind="danger">
                            {_t("Clear cache and reload")}
                        </AccessibleButton>
                    </SettingsSubsection>
                </SettingsSection>
            </SettingsTab>
        );
    }
}
