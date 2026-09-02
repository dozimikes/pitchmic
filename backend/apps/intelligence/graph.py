from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set


@dataclass
class GraphNode:
    node_id: str
    node_type: str  # "FOUNDER", "STARTUP", "INVESTOR", "FUND", "MARKET", "COMPETITOR"
    label: str
    properties: Dict[str, Any] = field(default_factory=dict)


@dataclass
class GraphEdge:
    source_id: str
    target_id: str
    relationship_type: str  # "FOUNDED", "INVESTED_IN", "OPERATES_IN", "COMPETES_WITH"
    properties: Dict[str, Any] = field(default_factory=dict)


class InvestmentKnowledgeGraph:
    """
    Investment Intelligence Entity Graph.
    Connects Founders, Startups, Investors, Funds, Markets, and Competitors.
    Enables link traversal and co-investment cluster identification.
    """

    def __init__(self):
        self.nodes: Dict[str, GraphNode] = {}
        self.adjacency: Dict[str, List[GraphEdge]] = {}

    def add_node(self, node_id: str, node_type: str, label: str, **properties):
        self.nodes[node_id] = GraphNode(
            node_id=node_id, node_type=node_type, label=label, properties=properties
        )
        if node_id not in self.adjacency:
            self.adjacency[node_id] = []

    def add_edge(
        self,
        source_id: str,
        target_id: str,
        relationship_type: str,
        **properties,
    ):
        if source_id in self.nodes and target_id in self.nodes:
            edge = GraphEdge(
                source_id=source_id,
                target_id=target_id,
                relationship_type=relationship_type,
                properties=properties,
            )
            self.adjacency[source_id].append(edge)

    def find_co_investors(self, investor_id: str) -> List[Dict[str, Any]]:
        """
        Finds investors who have co-invested in the same startups.
        """
        startups_invested = {
            e.target_id for e in self.adjacency.get(investor_id, [])
            if e.relationship_type == "INVESTED_IN"
        }

        co_investor_counts: Dict[str, int] = {}
        for other_id, edges in self.adjacency.items():
            if other_id != investor_id and self.nodes[other_id].node_type in ("INVESTOR", "FUND"):
                for edge in edges:
                    if edge.relationship_type == "INVESTED_IN" and edge.target_id in startups_invested:
                        co_investor_counts[other_id] = co_investor_counts.get(other_id, 0) + 1

        results = [
            {
                "investor_id": inv_id,
                "label": self.nodes[inv_id].label,
                "shared_deals_count": count,
            }
            for inv_id, count in sorted(co_investor_counts.items(), key=lambda x: x[1], reverse=True)
        ]
        return results

    def find_competitor_cluster(self, startup_id: str) -> List[Dict[str, Any]]:
        """
        Traverses competitors in the same operating market.
        """
        markets = {
            e.target_id for e in self.adjacency.get(startup_id, [])
            if e.relationship_type == "OPERATES_IN"
        }

        competitors = []
        for other_id, edges in self.adjacency.items():
            if other_id != startup_id and self.nodes[other_id].node_type == "STARTUP":
                for edge in edges:
                    if edge.relationship_type == "OPERATES_IN" and edge.target_id in markets:
                        competitors.append({
                            "startup_id": other_id,
                            "company_name": self.nodes[other_id].label,
                            "market_id": edge.target_id,
                        })
        return competitors
