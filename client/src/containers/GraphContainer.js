import React from "react";
import vis from "vis";
import { connect } from "react-redux";
import _ from "lodash";
import classnames from "classnames";

import NodeProperties from "../components/NodeProperties";
import PartialRenderInfo from "../components/PartialRenderInfo";
import Progress from "../components/Progress";

import { renderNetwork } from "../lib/graph";
import { outgoingEdges, childNodes } from "../lib/helpers";

import "../assets/css/Graph.scss";

import "vis/dist/vis.min.css";

const doubleClickTime = 0;
const threshold = 200;

class GraphContainer extends React.Component {
    constructor(props) {
        super(props);

        this.state = {
            renderProgress: 0,
            partiallyRendered: false,
        };
    }

    componentDidMount() {
        const {
            parsedResponse,
            treeView,
            onBeforeRender,
            onRendered,
            nodesDataset,
            edgesDataset,
        } = this.props;

        onBeforeRender();

        const { network } = renderNetwork({
            nodes: nodesDataset,
            edges: edgesDataset,
            allNodes: parsedResponse.allNodes,
            allEdges: parsedResponse.allEdges,
            containerEl: this.refs.graph,
            treeView,
        });

        // In tree view, physics is disabled and stabilizationIterationDone is not fired.
        if (treeView) {
            this.setState({ renderProgress: 100 }, () => {
                onRendered();
                // FIXME: tree does not fit because when it is rendered at the initial render, it is not visible
                // maybe lazy render.
                network.fit();
            });
        }

        this.configNetwork(network);

        this.setState({ network }, () => {
            window.addEventListener("resize", this.fitNetwork);
        });

        if (this.props.restoreSelectionOnLoad) {
            network.selectNodes([this.props.restoreSelectionOnLoad]);
            // network.setSelection does not fire events. Trigger them manually.
            const selectedNodes = network.getSelectedNodes();
            if (selectedNodes.length) {
                const node = network.body.data.nodes.get(selectedNodes[0]);
                this.props.onNodeSelected(node);
            }
        }

        // FIXME: hacky workaround for zoom problem: https://github.com/almende/vis/issues/3021.
        const els = document.getElementsByClassName("vis-network");
        for (let i = 0; i < els.length; i++) {
            els[i].style.width = null;
        }
    }

    componentWillUnmount() {
        window.removeEventListener("resize", this.fitNetwork);
    }

    // fitNetwork update the fit of the network.
    fitNetwork = () => {
        const { network } = this.state;

        if (network) {
            network.fit();
        }
    };

    // configNetwork configures the custom behaviors for a a network.
    configNetwork = network => {
        const {
            parsedResponse: { allNodes, allEdges },
            onNodeHovered,
            onNodeSelected,
        } = this.props;
        const { data } = network.body;
        const allEdgeSet = new vis.DataSet(allEdges);
        const allNodeSet = new vis.DataSet(allNodes);

        if (
            allNodeSet.length !== data.nodes.length ||
            allEdgeSet.length !== data.edges.length
        ) {
            this.setState({ partiallyRendered: true });
        }

        // multiLevelExpand recursively expands all edges outgoing from the node.
        const multiLevelExpand = nodeId => {
            let nodes = [nodeId],
                nodeStack = [nodeId],
                adjEdges = [],
                seen = {};
            while (nodeStack.length !== 0) {
                let nodeId = nodeStack.pop();
                if (seen[nodeId]) {
                    continue;
                }
                seen[nodeId] = true;

                let outgoing = outgoingEdges(nodeId, allEdgeSet),
                    adjNodeIds = outgoing.map(edge => edge.to);

                nodeStack = nodeStack.concat(adjNodeIds);
                nodes = nodes.concat(adjNodeIds);
                adjEdges = adjEdges.concat(outgoing);
                if (adjNodeIds.length > 3) {
                    break;
                }
            }
            data.nodes.update(allNodeSet.get(nodes));
            data.edges.update(adjEdges);
        };

        network.on("stabilizationProgress", params => {
            const widthFactor = params.iterations / params.total;

            this.setState({
                renderProgress: widthFactor * 100,
            });
        });

        network.once("stabilizationIterationsDone", () => {
            const { onRendered } = this.props;
            this.setState({ renderProgress: 100 }, () => {
                network.fit();
                onRendered();
            });
        });

        network.on("click", params => {
            const t0 = new Date();

            if (t0 - doubleClickTime > threshold) {
                setTimeout(() => {
                    if (t0 - doubleClickTime < threshold) {
                        return;
                    }

                    if (params.nodes.length > 0) {
                        const nodeUid = params.nodes[0];
                        const clickedNode = data.nodes.get(nodeUid);

                        onNodeSelected(clickedNode);
                    } else if (params.edges.length > 0) {
                        const edgeUid = params.edges[0];
                        const currentEdge = data.edges.get(edgeUid);

                        onNodeSelected(currentEdge);
                    } else {
                        onNodeSelected(null);
                    }
                }, threshold);
            }
        });

        network.on("doubleClick", params => {
            if (params.nodes && params.nodes.length > 0) {
                const clickedNodeUid = params.nodes[0];
                const clickedNode = data.nodes.get(clickedNodeUid);

                network.unselectAll();
                onNodeSelected(clickedNode);
                this.props.onExpandNode(clickedNode.uid);
            }
        });

        network.on("hoverNode", params => {
            const nodeUID = params.node;
            const currentNode = data.nodes.get(nodeUID);

            onNodeHovered(currentNode);
        });

        network.on("blurNode", params => {
            onNodeHovered(null);
        });

        network.on("hoverEdge", params => {
            const edgeUID = params.edge;
            const currentEdge = data.edges.get(edgeUID);

            onNodeHovered(currentEdge);
        });

        network.on("blurEdge", params => {
            onNodeHovered(null);
        });

        network.on("dragEnd", params => {
            for (let i = 0; i < params.nodes.length; i++) {
                let nodeId = params.nodes[i];
                data.nodes.update({ id: nodeId, fixed: { x: true, y: true } });
            }
        });

        network.on("dragStart", params => {
            for (let i = 0; i < params.nodes.length; i++) {
                let nodeId = params.nodes[i];
                data.nodes.update({
                    id: nodeId,
                    fixed: { x: false, y: false },
                });
            }
        });
    };

    // Collapse the network.
    handleCollapseNetwork = e => {
        e.preventDefault();

        const { network, partiallyRendered } = this.state;
        const {
            parsedResponse: { nodes, edges },
        } = this.props;

        const { data } = network.body;

        if (partiallyRendered) {
            return;
        }

        data.nodes.remove(data.nodes.getIds());
        data.edges.remove(data.edges.getIds());
        // Since we don't mutate the nodes and edges passed as props initially,
        // this still holds the initial state that was rendered and we can collapse
        // back the graph to that state.
        data.nodes.update(nodes);
        data.edges.update(edges);
        this.setState({ partiallyRendered: true });
        network.fit();
    };

    handleExpandNetwork = () => {
        const {
            parsedResponse: { allNodes, allEdges },
        } = this.props;
        const { network } = this.state;

        const { data } = network.body;
        const allEdgeSet = new vis.DataSet(allEdges);
        const allNodeSet = new vis.DataSet(allNodes);

        let nodeIds = data.nodes.getIds(),
            nodeSet = data.nodes,
            edgeSet = data.edges,
            // We add nodes and edges that have to be updated to these arrays.
            nodesBatch = new Set(),
            edgesBatch = [],
            batchSize = 200;

        while (nodeIds.length > 0) {
            let nodeId = nodeIds.pop();
            // If is expanded, do nothing, else put child nodes and edges into array for
            // expansion.
            if (
                outgoingEdges(nodeId, edgeSet).length ===
                outgoingEdges(nodeId, allEdgeSet).length
            ) {
                continue;
            }

            let outEdges = outgoingEdges(nodeId, allEdgeSet),
                outNodeIds = childNodes(outEdges);

            nodeIds = nodeIds.concat(outNodeIds);

            for (let id of outNodeIds) {
                nodesBatch.add(id);
            }

            edgesBatch = edgesBatch.concat(outEdges);

            if (nodesBatch.size > batchSize) {
                nodeSet.update(allNodeSet.get(Array.from(nodesBatch)));
                edgeSet.update(edgesBatch);
                nodesBatch = new Set();
                edgesBatch = [];
                return;
            }
        }

        if (nodeIds.length === 0) {
            this.setState({ partiallyRendered: false });
        }

        if (nodesBatch.size > 0 || edgesBatch.length > 0) {
            nodeSet.update(allNodeSet.get(Array.from(nodesBatch)));
            edgeSet.update(edgesBatch);
        }

        network.fit();
    };

    render() {
        const { parsedResponse, onExpandNode } = this.props;
        const { renderProgress, partiallyRendered } = this.state;

        const isRendering = renderProgress !== 100;
        const canToggleExpand =
            parsedResponse.nodes.length !== parsedResponse.numNodes &&
            parsedResponse.edges.length !== parsedResponse.numEdges;

        return (
            <div className="graph-container">
                {!isRendering && canToggleExpand ? (
                    <PartialRenderInfo
                        partiallyRendered={partiallyRendered}
                        onExpandNetwork={this.handleExpandNetwork}
                        onCollapseNetwork={this.handleCollapseNetwork}
                    />
                ) : null}
                {isRendering ? <Progress perc={renderProgress} /> : null}
                <div
                    ref="graph"
                    className={classnames("graph", { hidden: isRendering })}
                />
                {this.props.selectedNode ? (
                    <NodeProperties
                        node={this.props.selectedNode}
                        onExpandNode={onExpandNode}
                    />
                ) : null}
            </div>
        );
    }
}

export default connect(
    null,
    null,
    null,
    { withRef: true },
)(GraphContainer);
