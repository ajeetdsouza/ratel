import React from "react";

import FrameItem from "./FrameItem";

import "../assets/css/Frames.scss";

export default class FrameList extends React.Component {
    state = {
        count: 10,
    };

    loadMore = () => {
        this.setState(state => ({
            count: state.count + 10,
        }));
    };

    render() {
        const {
            activeFrameId,
            frames,
            onDiscardFrame,
            onSelectQuery,
            onUpdateConnectedState,
            patchFrame,
            url,
        } = this.props;
        const { count } = this.state;

        let finalFrames = frames;
        let loadMoreButton = null;
        if (frames.length > count) {
            finalFrames = finalFrames.slice(0, count);
            loadMoreButton = (
                <button
                    className="btn btn-default btn-load-more"
                    onClick={this.loadMore}
                    style={{ marginTop: 10 }}
                >
                    Load older queries
                </button>
            );
        }

        return (
            <div className="frame-list-outer">
                {finalFrames.map(frame => (
                    <FrameItem
                        key={frame.id}
                        activeFrameId={activeFrameId}
                        frame={frame}
                        collapsed={true}
                        onDiscardFrame={onDiscardFrame}
                        onSelectQuery={onSelectQuery}
                        onUpdateConnectedState={onUpdateConnectedState}
                        patchFrame={patchFrame}
                        url={url}
                    />
                ))}
                {loadMoreButton}
            </div>
        );
    }
}
