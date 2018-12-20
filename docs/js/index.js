/*
*    index.js
*    Final Project - Newton
*	 d3.sankey adapted from https://codepen.io/mikibihon/pen/VXydaX by Mariel Acuna, found on Github
*
*/
d3.sankey = function() {
    var sankey = {},
        nodeWidth = 24,
        nodePadding = 8,
        size = [1, 1],
        nodes = [],
        links = [];
  
    sankey.nodeWidth = function(_) {
      if (!arguments.length) return nodeWidth;
      nodeWidth = +_;
      return sankey;
    };
  
    sankey.nodePadding = function(_) {
      if (!arguments.length) return nodePadding;
      nodePadding = +_;
      return sankey;
    };
  
    sankey.nodes = function(_) {
      if (!arguments.length) return nodes;
      nodes = _;
      return sankey;
    };
  
    sankey.links = function(_) {
      if (!arguments.length) return links;
      links = _;
      return sankey;
    };
  
    sankey.size = function(_) {
      if (!arguments.length) return size;
      size = _;
      return sankey;
    };
  
    sankey.layout = function(iterations) {
      computeNodeLinks();
      computeNodeValues();
      computeNodeBreadths();
      computeNodeDepths(iterations);
      computeLinkDepths();
      return sankey;
    };
  
    sankey.relayout = function() {
      computeLinkDepths();
      return sankey;
    };
  
    sankey.link = function() {
      var curvature = .5;
  
      function link(d) {
        var x0 = d.source.x + d.source.dx,
            x1 = d.target.x,
            xi = d3.interpolateNumber(x0, x1),
            x2 = xi(curvature),
            x3 = xi(1 - curvature),
            y0 = d.source.y + d.sy + d.dy / 2,
            y1 = d.target.y + d.ty + d.dy / 2;
        return "M" + x0 + "," + y0
             + "C" + x2 + "," + y0
             + " " + x3 + "," + y1
             + " " + x1 + "," + y1;
      }
  
      link.curvature = function(_) {
        if (!arguments.length) return curvature;
        curvature = +_;
        return link;
      };
  
      return link;
    };
  
    // Populate the sourceLinks and targetLinks for each node.
    // Also, if the source and target are not objects, assume they are indices.
    function computeNodeLinks() {
      nodes.forEach(function(node) {
        node.sourceLinks = [];
        node.targetLinks = [];
      });
      links.forEach(function(link) {
        var source = link.source,
            target = link.target;
        if (typeof source === "number") source = link.source = nodes[link.source];
        if (typeof target === "number") target = link.target = nodes[link.target];
        source.sourceLinks.push(link);
        target.targetLinks.push(link);
      });
    }
  
    // Compute the value (size) of each node by summing the associated links.
    function computeNodeValues() {
      nodes.forEach(function(node) {
        node.value = Math.max(
          d3.sum(node.sourceLinks, value),
          d3.sum(node.targetLinks, value)
        );
      });
    }
  
    // Iteratively assign the breadth (x-position) for each node.
    // Nodes are assigned the maximum breadth of incoming neighbors plus one;
    // nodes with no incoming links are assigned breadth zero, while
    // nodes with no outgoing links are assigned the maximum breadth.
    function computeNodeBreadths() {
      var remainingNodes = nodes,
          nextNodes,
          x = 0;
  
      while (remainingNodes.length) {
        nextNodes = [];
        remainingNodes.forEach(function(node) {
          node.x = x;
          node.dx = nodeWidth;
          node.sourceLinks.forEach(function(link) {
            nextNodes.push(link.target);
          });
        });
        remainingNodes = nextNodes;
        ++x;
      }
  
      //
      moveSinksRight(x);
      scaleNodeBreadths((width - nodeWidth) / (x - 1));
    }
  
    function moveSourcesRight() {
      nodes.forEach(function(node) {
        if (!node.targetLinks.length) {
          node.x = d3.min(node.sourceLinks, function(d) { return d.target.x; }) - 1;
        }
      });
    }
  
    function moveSinksRight(x) {
      nodes.forEach(function(node) {
        if (!node.sourceLinks.length) {
          node.x = x - 1;
        }
      });
    }
  
    function scaleNodeBreadths(kx) {
      nodes.forEach(function(node) {
        node.x *= kx;
      });
    }
  
    function computeNodeDepths(iterations) {
      var nodesByBreadth = d3.nest()
          .key(function(d) { return d.x; })
          .sortKeys(d3.ascending)
          .entries(nodes)
          .map(function(d) { return d.values; });
  
      //
      initializeNodeDepth();
      resolveCollisions();
      for (var alpha = 1; iterations > 0; --iterations) {
        relaxRightToLeft(alpha *= .99);
        resolveCollisions();
        relaxLeftToRight(alpha);
        resolveCollisions();
      }
  
      function initializeNodeDepth() {
        var ky = d3.min(nodesByBreadth, function(nodes) {
          return (size[1] - (nodes.length - 1) * nodePadding) / d3.sum(nodes, value);
        });
  
        nodesByBreadth.forEach(function(nodes) {
          nodes.forEach(function(node, i) {
            node.y = i;
            node.dy = node.value * ky;
          });
        });
  
        links.forEach(function(link) {
          link.dy = link.value * ky;
        });
      }
  
      function relaxLeftToRight(alpha) {
        nodesByBreadth.forEach(function(nodes, breadth) {
          nodes.forEach(function(node) {
            if (node.targetLinks.length) {
              var y = d3.sum(node.targetLinks, weightedSource) / d3.sum(node.targetLinks, value);
              node.y += (y - center(node)) * alpha;
            }
          });
        });
  
        function weightedSource(link) {
          return center(link.source) * link.value;
        }
      }
  
      function relaxRightToLeft(alpha) {
        nodesByBreadth.slice().reverse().forEach(function(nodes) {
          nodes.forEach(function(node) {
            if (node.sourceLinks.length) {
              var y = d3.sum(node.sourceLinks, weightedTarget) / d3.sum(node.sourceLinks, value);
              node.y += (y - center(node)) * alpha;
            }
          });
        });
  
        function weightedTarget(link) {
          return center(link.target) * link.value;
        }
      }
  
      function resolveCollisions() {
        nodesByBreadth.forEach(function(nodes) {
          var node,
              dy,
              y0 = 0,
              n = nodes.length,
              i;
  
          // Push any overlapping nodes down.
          nodes.sort(ascendingDepth);
          for (i = 0; i < n; ++i) {
            node = nodes[i];
            dy = y0 - node.y;
            if (dy > 0) node.y += dy;
            y0 = node.y + node.dy + nodePadding;
          }
  
          // If the bottommost node goes outside the bounds, push it back up.
          dy = y0 - nodePadding - size[1];
          if (dy > 0) {
            y0 = node.y -= dy;
  
            // Push any overlapping nodes back up.
            for (i = n - 2; i >= 0; --i) {
              node = nodes[i];
              dy = node.y + node.dy + nodePadding - y0;
              if (dy > 0) node.y -= dy;
              y0 = node.y;
            }
          }
        });
      }
  
      function ascendingDepth(a, b) {
        return a.y - b.y;
      }
    }
  
    function computeLinkDepths() {
      nodes.forEach(function(node) {
        node.sourceLinks.sort(ascendingTargetDepth);
        node.targetLinks.sort(ascendingSourceDepth);
      });
      nodes.forEach(function(node) {
        var sy = 0, ty = 0;
        node.sourceLinks.forEach(function(link) {
          link.sy = sy;
          sy += link.dy;
        });
        node.targetLinks.forEach(function(link) {
          link.ty = ty;
          ty += link.dy;
        });
      });
  
      function ascendingSourceDepth(a, b) {
        return a.source.y - b.source.y;
      }
  
      function ascendingTargetDepth(a, b) {
        return a.target.y - b.target.y;
      }
    }
  
    function center(node) {
      return node.y + node.dy / 2;
    }
  
    function value(link) {
      return link.value;
    }
  
    return sankey;
  };


var units = "Cases";

var margin = {top: 15, right: 10, bottom: 10, left: 10},
    width = 800 - margin.left - margin.right,
    height = 400 - margin.top - margin.bottom;

var formatNumber = d3.format(",.0f"),    // zero decimal places
    format = function(d) { return formatNumber(d) + " " + units; },
    color = d3.scale.category10();

// append the svg canvas to the page
var svg = d3.select("#chart").append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
	.append("g")
    .attr("transform", 
          "translate(" + margin.left + "," + margin.top + ")");

// append labels
var dy = -4

svg.append("text")
        .attr("x", (0))             
        .attr("y", dy)
        .attr("text-anchor", "start")  
        .style("font-size", "16px") 
		.style("text-decoration", "underline")  
        .text("Citizenship");

svg.append("text")
        .attr("x", (width / 3))             
        .attr("y", dy)
        .attr("text-anchor", "middle")  
        .style("font-size", "16px") 
		.style("text-decoration", "underline")  
        .text("Exploited in");

svg.append("text")
        .attr("x", width*(2/3))             
        .attr("y", dy)
        .attr("text-anchor", "middle")  
        .style("font-size", "16px") 
		.style("text-decoration", "underline")  
        .text("Gender");

svg.append("text")
        .attr("x", (width))             
        .attr("y", dy)
        .attr("text-anchor", "end")  
        .style("font-size", "16px") 
		.style("text-decoration", "underline")  
        .text("Sex Crime?");

svg.append("text")
        .attr("x", (width))             
        .attr("y", height+10)
        .attr("text-anchor", "end")  
        .style("font-size", "10px") 
		.style("text-decoration", "underline")  
        .text("Unk = Unknown-either blank or reported as unknown");

// Set the sankey diagram properties
var sankey = d3.sankey()
    .nodeWidth(20)
    .nodePadding(15)
    .size([width, height]);

var path = sankey.link();

var rawdata=[];

//Read in the data -- couldn't get CSV or JSON readers to get in the proper format
/*d3.CSV("data/HT_Summary.csv", function(d) {
	return{
	rawdata.forEach(function(d) {
		d.source= d.source;
		d.target= d.target;
		d.value= +d.value;	 
	});
	console.log(rawdata[0]);  
   //update(rawdata);   // this calls a function to do all the other d3 stuff 
});
//console.log(rawdata[0]);   
*/

/*
//Read in the data -- I couldn't get this to work either! something is weird.  I've spent hours trying, so went for a var below.
d3.json("data/HT_Summary.json", function(rawdata) {
	rawdata.forEach(function(d) {
		d.source= d.source;
		d.target= d.target;
		d.value= +d.value;	 
	});
	console.log(rawdata[0]);  
   //update(rawdata);   // this calls a function to do all the other d3 stuff 
});
//console.log(rawdata[0]);   

*/
var rawdata = [
	{
	"source": "Cit-Unk",
	"target": "Exp-Unk",
	"value": 517
	},
	{
	"source": "Cit-Unk",
	"target": "Exp-SA",
	"value": 59
	},
	{
	"source": "Cit-Unk",
	"target": "Exp-AS",
	"value": 96
	},
	{
	"source": "Cit-Unk",
	"target": "Exp-NA",
	"value": 24306
	},
	{
	"source": "Cit-AS",
	"target": "Exp-Unk",
	"value": 18373
	},
	{
	"source": "Cit-AS",
	"target": "Exp-AS",
	"value": 13126
	},
	{
	"source": "Cit-AS",
	"target": "Exp-NA",
	"value": 319
	},
	{
	"source": "Cit-AS",
	"target": "Exp-AF",
	"value": 56
	},
	{
	"source": "Cit-EU",
	"target": "Exp-Unk",
	"value": 2379
	},
	{
	"source": "Cit-EU",
	"target": "Exp-AS",
	"value": 4974
	},
	{
	"source": "Cit-EU",
	"target": "Exp-EU",
	"value": 19162
	},
	{
	"source": "Cit-AF",
	"target": "Exp-Unk",
	"value": 22
	},
	{
	"source": "Cit-AF",
	"target": "Exp-AS",
	"value": 216
	},
	{
	"source": "Cit-AF",
	"target": "Exp-AF",
	"value": 1617
	},
	{
	"source": "Cit-SA",
	"target": "Exp-Unk",
	"value": 111
	},
	{
	"source": "Cit-SA",
	"target": "Exp-SA",
	"value": 31
	},
	{
	"source": "Cit-NA",
	"target": "Exp-NA",
	"value": 9580
	},
	{
	"source": "Exp-AF",
	"target": "Gen-Female",
	"value": 888
	},
	{
	"source": "Exp-AF",
	"target": "Gen-Male",
	"value": 1676
	},
	{
	"source": "Exp-AS",
	"target": "Gen-Unk",
	"value": 28
	},
	{
	"source": "Exp-AS",
	"target": "Gen-Female",
	"value": 12724
	},
	{
	"source": "Exp-AS",
	"target": "Gen-Male",
	"value": 10460
	},
	{
	"source": "Exp-AS",
	"target": "Gen-Unk",
	"value": 116
	},
	{
	"source": "Exp-EU",
	"target": "Gen-Female",
	"value": 17950
	},
	{
	"source": "Exp-EU",
	"target": "Gen-Male",
	"value": 7764
	},
	{
	"source": "Exp-NA",
	"target": "Gen-Unk",
	"value": 48
	},
	{
	"source": "Exp-NA",
	"target": "Gen-Female",
	"value": 31234
	},
	{
	"source": "Exp-NA",
	"target": "Gen-Male",
	"value": 2634
	},
	{
	"source": "Exp-NA",
	"target": "Gen-Unk",
	"value": 892
	},
	{
	"source": "Exp-SA",
	"target": "Gen-Unk",
	"value": 118
	},
	{
	"source": "Exp-SA",
	"target": "Gen-Female",
	"value": 62
	},
	{
	"source": "Exp-Unk",
	"target": "Gen-Unk",
	"value": 26
	},
	{
	"source": "Exp-Unk",
	"target": "Gen-Female",
	"value": 17844
	},
	{
	"source": "Exp-Unk",
	"target": "Gen-Male",
	"value": 6354
	},
	{
	"source": "Exp-Unk",
	"target": "Gen-Unk",
	"value": 50
	},
	{
	  "source": "Gen-Unk",
	  "target": "Sex-Unk",
	  "value": 692
	},
	{
	  "source": "Gen-Unk",
	  "target": "Sex-No",
	  "value": 106
	},
	{
	  "source": "Gen-Unk",
	  "target": "Sex-Yes",
	  "value": 480
	},
	{
	  "source": "Gen-Female",
	  "target": "Sex-Unk",
	  "value": 36866
	},
	{
	  "source": "Gen-Female",
	  "target": "Sex-No",
	  "value": 7558
	},
	{
	  "source": "Gen-Female",
	  "target": "Sex-Yes",
	  "value": 36278
	},
	{
	  "source": "Gen-Male",
	  "target": "Sex-Unk",
	  "value": 16804
	},
	{
	  "source": "Gen-Male",
	  "target": "Sex-No",
	  "value": 10580
	},
	{
	  "source": "Gen-Male",
	  "target": "Sex-Yes",
	  "value": 1504
	}
];


drawsankey(rawdata);
// load the data (using the timelyportfolio csv method)
function drawsankey(data) {
console.log(JSON.stringify(data));
  //set up graph in same style as original example but empty
  let graph = {"nodes" : [], "links" : []};

    data.forEach(function (d) {
      graph.nodes.push({ "name": d.source });
      graph.nodes.push({ "name": d.target });
      graph.links.push({ "source": d.source,
                         "target": d.target,
                         "value": +d.value });
     });

     // return only the distinct / unique nodes
     graph.nodes = d3.keys(d3.nest()
       .key(function (d) { return d.name; })
       .map(graph.nodes));
  console.log(graph.nodes)

     // loop through each link replacing the text with its index from node
     graph.links.forEach(function (d, i) {
       graph.links[i].source = graph.nodes.indexOf(graph.links[i].source);
       graph.links[i].target = graph.nodes.indexOf(graph.links[i].target);
     });

     //now loop through each nodes to make nodes an array of objects
     // rather than an array of strings
     graph.nodes.forEach(function (d, i) {
       graph.nodes[i] = { "name": d };
     });

  sankey
    .nodes(graph.nodes)
    .links(graph.links)
    .layout(20);

// add in the links

  var link = svg.append("g").selectAll(".link")
      .data(graph.links)
    .enter().append("path")
      .attr("class", "link")
      .attr("d", path)
      .style("stroke-width", function(d) { return Math.max(1, d.dy); })
      .style('stroke', d => {
        return color(d.source.name.replace(/ .*/, ""));
      })
      .sort(function(a, b) { return b.dy - a.dy; });

// add the link titles
  link.append("title")
        .text(function(d) {
    		return d.source.name + " → " + 
                d.target.name + "\n" + format(d.value); });

// add in the nodes
  var node = svg.append("g").selectAll(".node")
      .data(graph.nodes)
    .enter().append("g")
      .attr("class", "node")
      .attr("transform", function(d) { 
		  return "translate(" + d.x + "," + d.y + ")"; })
    .call(d3.behavior.drag()
      .origin(function(d) { return d; })
      .on("dragstart", function() { 
		  this.parentNode.appendChild(this); })
      .on("drag", dragmove));

// add the rectangles for the nodes
  node.append("rect")
      .attr("height", function(d) { return d.dy; })
      .attr("width", sankey.nodeWidth())
      .style("fill", function(d) { 
		    return d.color = color(d.name.replace(/ .*/, "")); })
      .style("stroke", function(d) { 
		  return d3.rgb(d.color).darker(2); })
    .append("title")
      .text(function(d) { 
		  return d.name + "\n" + format(d.value); });

// add in the title for the nodes
  node.append("text")
      .attr("x", -6)
      .attr("y", function(d) { return d.dy / 2; })
      .attr("dy", ".35em")
      .attr("text-anchor", "end")
      .attr("transform", null)
      .text(function(d) {return d.name.substring(4) + ' ' + format(d.value); })
	  .filter(function(d) { return d.x < width / 2; })
      .attr("x", 6 + sankey.nodeWidth())
      .attr("text-anchor", "start");

// the function for moving the nodes
  function dragmove(d) {
    d3.select(this).attr("transform", 
        "translate(" + d.x + "," + (
                d.y = Math.max(0, Math.min(height - d.dy, d3.event.y))
            ) + ")");
    sankey.relayout();
    link.attr("d", path);
  }
};