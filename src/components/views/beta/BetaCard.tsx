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

import React, { ReactNode, useState } from "react";
import { sleep } from "matrix-js-sdk/src/utils";

import { _t } from "../../../languageHandler";
import AccessibleButton from "../elements/AccessibleButton";
import SettingsStore from "../../../settings/SettingsStore";
import { SettingLevel } from "../../../settings/SettingLevel";
import SdkConfig from "../../../SdkConfig";
import SettingsFlag from "../elements/SettingsFlag";
import { useFeatureEnabled } from "../../../hooks/useSettings";
import InlineSpinner from "../elements/InlineSpinner";
import AccessibleTooltipButton from "../elements/AccessibleTooltipButton";

// XXX: Keep this around for re-use in future Betas

interface IProps {
    title?: string;
    featureId: string;
}

interface IBetaPillProps {
    onClick?: () => void;
    tooltipTitle?: string;
    tooltipCaption?: string;
}

export const BetaPill: React.FC<IBetaPillProps> = ({
    onClick,
    tooltipTitle = _t("This is a beta feature"),
    tooltipCaption = _t("Click for more info"),
}) => {
    if (onClick) {
        return (
            <AccessibleTooltipButton
                className="mx_BetaCard_betaPill"
                title={`${tooltipTitle} ${tooltipCaption}`}
                tooltip={
                    <div>
                        <div className="mx_Tooltip_title">{tooltipTitle}</div>
                        <div className="mx_Tooltip_sub">{tooltipCaption}</div>
                    </div>
                }
                onClick={onClick}
            >
                {_t("Beta")}
            </AccessibleTooltipButton>
        );
    }

    return <span className="mx_BetaCard_betaPill">{_t("Beta")}</span>;
};
