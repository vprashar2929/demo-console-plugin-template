import * as React from 'react';
import {
  Card,
  CardBody,
  CardTitle,
  Content,
  Grid,
  GridItem,
  Spinner,
  Alert,
  Title,
  Flex,
  FlexItem,
  PageSection,
  FormSelect,
  FormSelectOption,
  Toolbar,
  ToolbarContent,
  ToolbarItem,
} from '@patternfly/react-core';
import {
  Chart,
  ChartAxis,
  ChartGroup,
  ChartLine,
  ChartThemeColor,
  ChartVoronoiContainer,
  ChartDonut,
} from '@patternfly/react-charts';
import {
  usePrometheusPoll,
  PrometheusEndpoint,
} from '@openshift-console/dynamic-plugin-sdk';
import {
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableVariant,
} from '@patternfly/react-table';

// Component for Gauge Display
const PowerGauge: React.FC<{ value: number; title: string; color?: string }> = ({ 
  value, 
  title, 
  color = '#0066CC' 
}) => {
  const maxValue = 1000; // Max value for gauge display
  
  return (
    <div style={{ textAlign: 'center', padding: '20px' }}>
      <ChartDonut
        ariaDesc={`${title} gauge`}
        ariaTitle={title}
        data={[
          { x: 'Used', y: value },
          { x: 'Available', y: Math.max(0, maxValue - value) },
        ]}
        height={250}
        labels={({ datum }) => `${datum.x}: ${datum.y}`}
        padding={{
          bottom: 20,
          left: 20,
          right: 20,
          top: 20,
        }}
        subTitle="Watts"
        title={`${value.toFixed(0)} W`}
        themeColor={ChartThemeColor.blue}
        width={250}
      />
      <Title headingLevel="h4" size="md">
        {title}
      </Title>
    </div>
  );
};

// Component for Total Cluster Power Consumption (Gauge-like display)
const TotalClusterPowerCard: React.FC = () => {
  // Query matches the Grafana dashboard - prefers psys over package
  const [totalData] = usePrometheusPoll({
    query: `# 1. Sum 'psys' from nodes that HAVE 'psys'
(sum(
  kepler_node_cpu_watts{job="power-monitor",zone="psys"}
) or vector(0))
+
# 2. Sum 'package' from nodes that DO NOT HAVE 'psys'
(sum(
  kepler_node_cpu_watts{job="power-monitor",zone="package"}
  unless on(node_name)
  kepler_node_cpu_watts{job="power-monitor",zone="psys"}
) or vector(0))
+
# 3. Sum 'dram' from ALL nodes that have it
(sum(
  kepler_node_cpu_watts{job="power-monitor",zone="dram"}
) or vector(0))`,
    endpoint: PrometheusEndpoint.QUERY,
  });

  const [activeData] = usePrometheusPoll({
    query: `(sum(
  kepler_node_cpu_active_watts{job="power-monitor",zone="psys"}
) or vector(0))
+
(sum(
  kepler_node_cpu_active_watts{job="power-monitor",zone="package"}
  unless on(node_name)
  kepler_node_cpu_active_watts{job="power-monitor",zone="psys"}
) or vector(0))
+
(sum(
  kepler_node_cpu_active_watts{job="power-monitor",zone="dram"}
) or vector(0))`,
    endpoint: PrometheusEndpoint.QUERY,
  });

  const [idleData] = usePrometheusPoll({
    query: `(sum(
  kepler_node_cpu_idle_watts{job="power-monitor",zone="psys"}
) or vector(0))
+
(sum(
  kepler_node_cpu_idle_watts{job="power-monitor",zone="package"}
  unless on(node_name)
  kepler_node_cpu_idle_watts{job="power-monitor",zone="psys"}
) or vector(0))
+
(sum(
  kepler_node_cpu_idle_watts{job="power-monitor",zone="dram"}
) or vector(0))`,
    endpoint: PrometheusEndpoint.QUERY,
  });

  const totalWatts = totalData?.data?.result?.[0]?.value
    ? parseFloat(totalData.data.result[0].value[1])
    : 0;

  const activeWatts = activeData?.data?.result?.[0]?.value
    ? parseFloat(activeData.data.result[0].value[1])
    : 0;

  const idleWatts = idleData?.data?.result?.[0]?.value
    ? parseFloat(idleData.data.result[0].value[1])
    : 0;

  const loading = !totalData || !activeData || !idleData;
  const error = totalData?.error || activeData?.error || idleData?.error;

  return (
    <Card>
      <CardTitle>Total Power Consumption of Cluster</CardTitle>
      <CardBody>
        {loading && <Spinner size="lg" />}
        {error && (
          <Alert variant="warning" title="Error loading power metrics">
            {String(error)}
          </Alert>
        )}
        {!loading && !error && (
          <Grid hasGutter>
            <GridItem span={4}>
              <PowerGauge value={totalWatts} title="Total" color="#0066CC" />
            </GridItem>
            <GridItem span={4}>
              <PowerGauge value={activeWatts} title="Active" color="#06C" />
            </GridItem>
            <GridItem span={4}>
              <PowerGauge value={idleWatts} title="Idle" color="#8BC34A" />
            </GridItem>
          </Grid>
        )}
      </CardBody>
    </Card>
  );
};

// Component for Top 5 Power Consuming Nodes
const TopNodesCard: React.FC = () => {
  const [data, loading, error] = usePrometheusPoll({
    query: `topk(5,
  (
    # Part A: Sum of SoC power (PSYS or PACKAGE) per node
    (
      sum by (node_name) (
        (
          # A.1: Get PSYS values from PSYS nodes
          kepler_node_cpu_watts{job="power-monitor",zone="psys"}
        )
        or
        (
          # A.2: Get PACKAGE values from non-PSYS nodes
          kepler_node_cpu_watts{job="power-monitor",zone="package"}
          unless on(node_name)
          kepler_node_cpu_watts{job="power-monitor",zone="psys"}
        )
      ) or vector(0)
    )
    +
    # Part B: Sum of DRAM power from ALL nodes per node
    (
      sum by (node_name) (
        kepler_node_cpu_watts{job="power-monitor",zone="dram"}
      ) or vector(0)
    )
  ) > 0
)`,
    endpoint: PrometheusEndpoint.QUERY,
  });

  const nodeMetrics = React.useMemo(() => {
    if (!data?.data?.result) return [];
    return data.data.result.map((result: any) => ({
      node: result.metric.node_name || 'unknown',
      watts: parseFloat(result.value[1]),
    }));
  }, [data]);

  return (
    <Card>
      <CardTitle>Top 5 Power Consuming Nodes</CardTitle>
      <CardBody>
        {error && (
          <Alert variant="warning" title="Error loading node metrics">
            {String(error)}
          </Alert>
        )}
        {!error && nodeMetrics.length === 0 && !loading && (
          <Alert variant="info" title="No data available">
            No node power metrics found.
          </Alert>
        )}
        {!error && nodeMetrics.length > 0 && (
          <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsSm' }}>
            {nodeMetrics.map((metric, index) => (
              <FlexItem key={metric.node}>
                <Flex justifyContent={{ default: 'justifyContentSpaceBetween' }}>
                  <FlexItem>
                    <Content component="p">
                      {index + 1}. <strong>{metric.node}</strong>
                    </Content>
                  </FlexItem>
                  <FlexItem>
                    <Content component="p">
                      {metric.watts.toFixed(2)} W
                    </Content>
                  </FlexItem>
                </Flex>
              </FlexItem>
            ))}
          </Flex>
        )}
      </CardBody>
    </Card>
  );
};

// Component for Top 10 Power Consuming Namespaces
const TopNamespacesCard: React.FC<{ namespaceFilter: string }> = ({ namespaceFilter }) => {
  const namespaceSelector = namespaceFilter !== 'All' ? `,pod_namespace="${namespaceFilter}"` : '';
  const [data, loading, error] = usePrometheusPoll({
    query: `topk(10,
  (
    # Part A: Sum of SoC power (PSYS or PACKAGE) per namespace
    (
      sum by (pod_namespace,node_name) (
        (
          # A.1: Get PSYS attributions from pods on PSYS nodes
          kepler_pod_cpu_watts{job="power-monitor",zone="psys"${namespaceSelector}}
          and on(node_name)
          kepler_node_cpu_watts{job="power-monitor",zone="psys"}
        )
        or
        (
          # A.2: Get PACKAGE attributions from pods on non-PSYS nodes
          kepler_pod_cpu_watts{job="power-monitor",zone="package"${namespaceSelector}}
          unless on(node_name)
          kepler_node_cpu_watts{job="power-monitor",zone="psys"}
        )
      ) or vector(0)
    )
    +
    # Part B: Sum of DRAM power from ALL nodes per namespace
    (
      sum by (pod_namespace,node_name) (
        kepler_pod_cpu_watts{job="power-monitor",zone="dram"${namespaceSelector}}
      ) or vector(0)
    )
  ) > 0
)`,
    endpoint: PrometheusEndpoint.QUERY,
  });

  const namespaceMetrics = React.useMemo(() => {
    if (!data?.data?.result) return [];
    return data.data.result.map((result: any) => ({
      namespace: result.metric.pod_namespace || 'unknown',
      node: result.metric.node_name || 'unknown',
      watts: parseFloat(result.value[1]),
    }));
  }, [data]);

  const columns = ['Namespace', 'Node', 'Power'];
  const rows = namespaceMetrics.map((metric) => [
    metric.namespace,
    metric.node,
    `${metric.watts.toFixed(2)} W`,
  ]);

  return (
    <Card>
      <CardTitle>Top 10 Power Consuming Namespaces (W)</CardTitle>
      <CardBody>
        {error && (
          <Alert variant="warning" title="Error loading namespace metrics">
            {String(error)}
          </Alert>
        )}
        {!error && rows.length === 0 && !loading && (
          <Alert variant="info" title="No data available">
            No namespace power metrics found.
          </Alert>
        )}
        {!error && rows.length > 0 && (
          <Table aria-label="Top 10 Power Consuming Namespaces" variant={TableVariant.compact}>
            <Thead>
              <Tr>
                {columns.map((column, index) => (
                  <Th key={index}>{column}</Th>
                ))}
              </Tr>
            </Thead>
            <Tbody>
              {rows.map((row, rowIndex) => (
                <Tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <Td key={cellIndex}>{cell}</Td>
                  ))}
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </CardBody>
    </Card>
  );
};

// Component for Pod Power Consumption Chart
const PodPowerChart: React.FC<{ 
  namespaceFilter: string;
  podFilter: string;
  zoneFilter: string;
}> = ({ namespaceFilter, podFilter, zoneFilter }) => {
  const namespaceSelector = namespaceFilter !== 'All' ? `,pod_namespace="${namespaceFilter}"` : '';
  const podSelector = podFilter !== 'All' ? `,pod_name=~"${podFilter}"` : '';
  const zoneSelector = zoneFilter !== 'All' ? `,zone="${zoneFilter}"` : '';
  
  const [data, loading, error] = usePrometheusPoll({
    query: `kepler_pod_cpu_watts{job="power-monitor"${namespaceSelector}${podSelector}${zoneSelector}}`,
    endpoint: PrometheusEndpoint.QUERY_RANGE,
    endTime: Date.now(),
    timespan: 300000, // Last 5 minutes
    samples: 30,
  });

  const chartData = React.useMemo(() => {
    if (!data?.data?.result) return [];

    // Group by namespace and take top 10 pods
    const podData = data.data.result
      .map((series: any) => {
        const zone = series.metric.zone || 'unknown';
        const podName = series.metric.pod_name || 'unknown';
        return {
          name: `${zone} - ${podName}`,
          data: series.values.map((value: any) => ({
            x: new Date(value[0] * 1000),
            y: parseFloat(value[1]),
          })),
        };
      })
      .slice(0, 10); // Limit to 10 pods for readability

    return podData;
  }, [data]);

  return (
    <Card isCompact>
      <CardTitle>Pod Power Consumption (W) By Zone</CardTitle>
      <CardBody style={{ padding: '0.5rem', minHeight: '180px', maxHeight: '220px' }}>
        {error && (
          <Alert variant="warning" title="Error loading pod data">
            {String(error)}
          </Alert>
        )}
        {!error && chartData.length === 0 && !loading && (
          <Alert variant="info" title="No data available">
            No pod power data found.
          </Alert>
        )}
        {!error && chartData.length > 0 && (
          <div style={{ width: '100%', height: '100%' }}>
            <Chart
              ariaDesc="Pod power consumption over time"
              ariaTitle="Pod Power Consumption"
              containerComponent={
                <ChartVoronoiContainer
                  labels={({ datum }) => `${datum.name}: ${datum.y?.toFixed(2)} W`}
                  constrainToVisibleArea
                />
              }
              height={200}
              legendData={chartData.map((s) => ({ name: s.name }))}
              legendPosition="bottom-left"
              padding={{
                bottom: 45,
                left: 50,
                right: 20,
                top: 10,
              }}
              themeColor={ChartThemeColor.multiOrdered}
            >
              <ChartAxis
                tickFormat={(t) => {
                  const date = new Date(t);
                  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
                }}
              />
              <ChartAxis dependentAxis showGrid tickFormat={(t) => `${t} W`} />
              <ChartGroup>
                {chartData.map((series) => (
                  <ChartLine key={series.name} data={series.data} name={series.name} />
                ))}
              </ChartGroup>
            </Chart>
          </div>
        )}
      </CardBody>
    </Card>
  );
};

// Component for Power Consumption By Zone Table
const PowerByZoneTable: React.FC<{ queryType: 'total' | 'active' | 'idle'; zoneFilter: string }> = ({
  queryType,
  zoneFilter,
}) => {
  const zoneSelector = zoneFilter !== 'All' ? `,zone="${zoneFilter}"` : '';
  const queryMap = {
    total: `sum by (zone,node_name) (kepler_node_cpu_watts{job="power-monitor"${zoneSelector}})`,
    active: `sum by (zone,node_name) (kepler_node_cpu_active_watts{job="power-monitor"${zoneSelector}})`,
    idle: `sum by (zone,node_name) (kepler_node_cpu_idle_watts{job="power-monitor"${zoneSelector}})`,
  };

  const titleMap = {
    total: 'Current Total Power Consumption By Zone',
    active: 'Current Active Power Consumption By Zone',
    idle: 'Current Idle Power Consumption By Zone',
  };

  const [data, loading, error] = usePrometheusPoll({
    query: queryMap[queryType],
    endpoint: PrometheusEndpoint.QUERY,
  });

  const zoneMetrics = React.useMemo(() => {
    if (!data?.data?.result) return [];
    return data.data.result.map((result: any) => ({
      zone: result.metric.zone || 'unknown',
      node: result.metric.node_name || 'unknown',
      watts: parseFloat(result.value[1]),
    }));
  }, [data]);

  const columns = ['Zone', 'Node', 'Watts'];
  const rows = zoneMetrics.map((metric) => [
    metric.zone,
    metric.node,
    `${metric.watts.toFixed(2)} W`,
  ]);

  return (
    <Card>
      <CardTitle>{titleMap[queryType]}</CardTitle>
      <CardBody>
        {error && (
          <Alert variant="warning" title="Error loading zone metrics">
            {String(error)}
          </Alert>
        )}
        {!error && rows.length === 0 && !loading && (
          <Alert variant="info" title="No data available">
            No zone power metrics found.
          </Alert>
        )}
        {!error && rows.length > 0 && (
          <Table aria-label={titleMap[queryType]} variant={TableVariant.compact}>
            <Thead>
              <Tr>
                {columns.map((column, index) => (
                  <Th key={index}>{column}</Th>
                ))}
              </Tr>
            </Thead>
            <Tbody>
              {rows.map((row, rowIndex) => (
                <Tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <Td key={cellIndex}>{cell}</Td>
                  ))}
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </CardBody>
    </Card>
  );
};

// Component for Power Trend Chart (Total Power per Zone over time)
const PowerTrendCard: React.FC<{ zoneFilter: string }> = ({ zoneFilter }) => {
  const zoneSelector = zoneFilter !== 'All' ? `,zone="${zoneFilter}"` : '';
  const [data, loading, error] = usePrometheusPoll({
    query: `sum by (zone) (kepler_node_cpu_watts{job="power-monitor"${zoneSelector}})`,
    endpoint: PrometheusEndpoint.QUERY_RANGE,
    endTime: Date.now(),
    timespan: 300000, // Last 5 minutes
    samples: 30,
  });

  const chartDataByZone = React.useMemo(() => {
    if (!data?.data?.result) return [];

    return data.data.result.map((series: any) => {
      const zone = series.metric.zone || 'unknown';
      return {
        name: `Zone - ${zone}`,
        data: series.values.map((value: any) => ({
          x: new Date(value[0] * 1000),
          y: parseFloat(value[1]),
        })),
      };
    });
  }, [data]);

  return (
    <Card isCompact>
      <CardTitle>Total Power Consumption (W) per Zone</CardTitle>
      <CardBody>
        {error && (
          <Alert variant="warning" title="Error loading trend data">
            {String(error)}
          </Alert>
        )}
        {!error && chartDataByZone.length === 0 && !loading && (
          <Alert variant="info" title="No data available">
            No historical data found.
          </Alert>
        )}
        {!error && chartDataByZone.length > 0 && (
          <Chart
            ariaDesc="Power consumption over time by zone"
            ariaTitle="Power Trend by Zone"
            containerComponent={
              <ChartVoronoiContainer
                labels={({ datum }) => `${datum.name}: ${datum.y?.toFixed(2)} W`}
                constrainToVisibleArea
              />
            }
            height={180}
            legendData={chartDataByZone.map((s) => ({ name: s.name }))}
            legendPosition="bottom-left"
            padding={{
              bottom: 45,
              left: 50,
              right: 20,
              top: 10,
            }}
            themeColor={ChartThemeColor.multiOrdered}
          >
            <ChartAxis
              tickFormat={(t) => {
                const date = new Date(t);
                return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
              }}
            />
            <ChartAxis dependentAxis showGrid tickFormat={(t) => `${t} W`} />
            <ChartGroup>
              {chartDataByZone.map((series, index) => (
                <ChartLine key={series.name} data={series.data} name={series.name} />
              ))}
            </ChartGroup>
          </Chart>
        )}
      </CardBody>
    </Card>
  );
};

// Component for Node Power Consumption Charts
const NodePowerChart: React.FC<{ 
  chartType: 'total' | 'active' | 'idle';
  nodeFilter: string;
  zoneFilter: string;
}> = ({ chartType, nodeFilter, zoneFilter }) => {
  const nodeSelector = nodeFilter !== 'All' ? `,instance=~"${nodeFilter}"` : '';
  const zoneSelector = zoneFilter !== 'All' ? `,zone="${zoneFilter}"` : '';
  const queryMap = {
    total: `kepler_node_cpu_watts{job="power-monitor"${nodeSelector}${zoneSelector}}`,
    active: `kepler_node_cpu_active_watts{job="power-monitor"${nodeSelector}${zoneSelector}}`,
    idle: `kepler_node_cpu_idle_watts{job="power-monitor"${nodeSelector}${zoneSelector}}`,
  };

  const titleMap = {
    total: 'Node Power Consumption (W) By Zone',
    active: 'Node Active Power Consumption (W) By Zone',
    idle: 'Node Idle Power Consumption (W) By Zone',
  };

  const [data, loading, error] = usePrometheusPoll({
    query: queryMap[chartType],
    endpoint: PrometheusEndpoint.QUERY_RANGE,
    endTime: Date.now(),
    timespan: 300000, // Last 5 minutes
    samples: 30,
  });

  const chartData = React.useMemo(() => {
    if (!data?.data?.result) return [];

    return data.data.result.map((series: any) => {
      const zone = series.metric.zone || 'unknown';
      const instance = series.metric.instance || series.metric.node_name || 'unknown';
      return {
        name: `${zone} - ${instance}`,
        data: series.values.map((value: any) => ({
          x: new Date(value[0] * 1000),
          y: parseFloat(value[1]),
        })),
      };
    });
  }, [data]);

  return (
    <Card isCompact>
      <CardTitle>{titleMap[chartType]}</CardTitle>
      <CardBody>
        {error && (
          <Alert variant="warning" title="Error loading chart data">
            {String(error)}
          </Alert>
        )}
        {!error && chartData.length === 0 && !loading && (
          <Alert variant="info" title="No data available">
            No data found.
          </Alert>
        )}
        {!error && chartData.length > 0 && (
          <Chart
            ariaDesc={titleMap[chartType]}
            ariaTitle={titleMap[chartType]}
            containerComponent={
              <ChartVoronoiContainer
                labels={({ datum }) => `${datum.name}: ${datum.y?.toFixed(2)} W`}
                constrainToVisibleArea
              />
            }
            height={180}
            legendData={chartData.slice(0, 10).map((s) => ({ name: s.name }))}
            legendPosition="bottom-left"
            padding={{
              bottom: 45,
              left: 50,
              right: 20,
              top: 10,
            }}
            themeColor={ChartThemeColor.multiOrdered}
          >
            <ChartAxis
              tickFormat={(t) => {
                const date = new Date(t);
                return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
              }}
            />
            <ChartAxis dependentAxis showGrid tickFormat={(t) => `${t} W`} />
            <ChartGroup>
              {chartData.slice(0, 10).map((series) => (
                <ChartLine key={series.name} data={series.data} name={series.name} />
              ))}
            </ChartGroup>
          </Chart>
        )}
      </CardBody>
    </Card>
  );
};

// Component for CPU Info
const CPUInfoCard: React.FC = () => {
  // Query using count to get the number of cores per instance/model
  const [response, loading, error] = usePrometheusPoll({
    query: 'count by (instance, model_name)(kepler_node_cpu_info{job="power-monitor"})',
    endpoint: PrometheusEndpoint.QUERY,
  });

  const cpuInfo = React.useMemo(() => {
    if (!response?.data?.result) {
      return [];
    }
    
    const result = response.data.result
      .map((result: any) => {
        return {
          instance: result.metric.instance || 'unknown',
          model: result.metric.model_name || 'unknown',
          cores: parseInt(result.value[1], 10),
        };
      })
      .sort((a, b) => a.instance.localeCompare(b.instance));
    
    return result;
  }, [response]);

  const columns = ['Node Name', 'Model Name', 'Cores'];
  const rows = cpuInfo.map((info) => [
    info.instance,
    info.model,
    info.cores.toString(),
  ]);

  return (
    <Card>
      <CardTitle>CPU Info</CardTitle>
      <CardBody>
        {error && (
          <Alert variant="warning" title="Error loading CPU info">
            {String(error)}
          </Alert>
        )}
        {!error && rows.length === 0 && !loading && (
          <Alert variant="info" title="No data available">
            No CPU information found.
            <br />
            <small>Query result count: {response?.data?.result?.length || 0}</small>
          </Alert>
        )}
        {!error && rows.length > 0 && (
          <Table aria-label="CPU Info" variant={TableVariant.compact}>
            <Thead>
              <Tr>
                {columns.map((column, index) => (
                  <Th key={index}>{column}</Th>
                ))}
              </Tr>
            </Thead>
            <Tbody>
              {rows.map((row, rowIndex) => (
                <Tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <Td key={cellIndex}>{cell}</Td>
                  ))}
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </CardBody>
    </Card>
  );
};

// Component for RAPL Info
const RAPLInfoCard: React.FC = () => {
  // Query all kepler_node_cpu_watts metrics to get node and zone info
  const [response, loading, error] = usePrometheusPoll({
    query: 'kepler_node_cpu_watts{job="power-monitor"}',
    endpoint: PrometheusEndpoint.QUERY,
  });

  const raplInfo = React.useMemo(() => {
    if (!response) {
      return [];
    }

    // The usePrometheusPoll hook returns the Prometheus response
    const results = response?.data?.result || [];
    
    if (!results || results.length === 0) {
      return [];
    }

    // Group by node_name and collect unique zones
    const nodeZoneMap = new Map<string, Set<string>>();
    
    results.forEach((result: any) => {
      const nodeName = result.metric.node_name;
      const zone = result.metric.zone;
      
      if (nodeName && zone) {
        if (!nodeZoneMap.has(nodeName)) {
          nodeZoneMap.set(nodeName, new Set());
        }
        nodeZoneMap.get(nodeName)?.add(zone);
      }
    });

    // Convert to array format for table and sort
    const result = Array.from(nodeZoneMap.entries())
      .map(([node, zones]) => ({
        node,
        zones: Array.from(zones).sort().join(', ')
      }))
      .sort((a, b) => a.node.localeCompare(b.node));
    
    return result;
  }, [response]);

  const columns = ['Node', 'Zones'];
  const rows = raplInfo.map((info) => [info.node, info.zones]);

  return (
    <Card>
      <CardTitle>RAPL Info</CardTitle>
      <CardBody>
        {error && (
          <Alert variant="warning" title="Error loading RAPL info">
            {String(error)}
          </Alert>
        )}
        {!error && rows.length === 0 && !loading && (
          <Alert variant="info" title="No data available">
            No RAPL information found.
            <br />
            <small>Query result count: {response?.data?.result?.length || 0}</small>
            <br />
            <small>Processed rows: {rows.length}</small>
          </Alert>
        )}
        {!error && rows.length > 0 && (
          <Table aria-label="RAPL Info" variant={TableVariant.compact}>
            <Thead>
              <Tr>
                {columns.map((column, index) => (
                  <Th key={index}>{column}</Th>
                ))}
              </Tr>
            </Thead>
            <Tbody>
              {rows.map((row, rowIndex) => (
                <Tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <Td key={cellIndex}>{cell}</Td>
                  ))}
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </CardBody>
    </Card>
  );
};

// Main Dashboard Component
export const PowerMonitoringDashboard: React.FC = () => {
  const [zoneFilter, setZoneFilter] = React.useState<string>('All');
  const [namespaceFilter, setNamespaceFilter] = React.useState<string>('All');
  const [podFilter, setPodFilter] = React.useState<string>('All');
  const [nodeFilter, setNodeFilter] = React.useState<string>('All');

  // Fetch available zones
  const [zoneData] = usePrometheusPoll({
    query: 'kepler_node_cpu_watts{job="power-monitor"}',
    endpoint: PrometheusEndpoint.QUERY,
  });

  // Fetch available namespaces
  const [namespaceData] = usePrometheusPoll({
    query: 'kepler_pod_cpu_watts{job="power-monitor"}',
    endpoint: PrometheusEndpoint.QUERY,
  });

  // Fetch available pods (filtered by namespace)
  const [podData] = usePrometheusPoll({
    query: namespaceFilter !== 'All' 
      ? `kepler_pod_cpu_watts{job="power-monitor",pod_namespace="${namespaceFilter}"}`
      : 'kepler_pod_cpu_watts{job="power-monitor"}',
    endpoint: PrometheusEndpoint.QUERY,
  });

  // Fetch available nodes
  const [nodeData] = usePrometheusPoll({
    query: 'kepler_node_cpu_info{job="power-monitor"}',
    endpoint: PrometheusEndpoint.QUERY,
  });

  const zones = React.useMemo(() => {
    if (!zoneData?.data?.result) return ['All'];
    const uniqueZones = new Set<string>(['All']);
    zoneData.data.result.forEach((result: any) => {
      const zone = result?.metric?.zone;
      if (zone) {
        uniqueZones.add(zone);
      }
    });
    return Array.from(uniqueZones).sort();
  }, [zoneData]);

  const namespaces = React.useMemo(() => {
    if (!namespaceData?.data?.result) return ['All'];
    const uniqueNamespaces = new Set<string>(['All']);
    namespaceData.data.result.forEach((result: any) => {
      const namespace = result?.metric?.pod_namespace;
      if (namespace) {
        uniqueNamespaces.add(namespace);
      }
    });
    return Array.from(uniqueNamespaces).sort();
  }, [namespaceData]);

  const pods = React.useMemo(() => {
    if (!podData?.data?.result) return ['All'];
    const uniquePods = new Set<string>(['All']);
    podData.data.result.forEach((result: any) => {
      const pod = result?.metric?.pod_name;
      if (pod) {
        uniquePods.add(pod);
      }
    });
    return Array.from(uniquePods).sort();
  }, [podData]);

  const nodes = React.useMemo(() => {
    if (!nodeData?.data?.result) return ['All'];
    const uniqueNodes = new Set<string>(['All']);
    nodeData.data.result.forEach((result: any) => {
      const node = result?.metric?.instance;
      if (node) {
        uniqueNodes.add(node);
      }
    });
    return Array.from(uniqueNodes).sort();
  }, [nodeData]);

  return (
    <>
      <PageSection>
        <Title headingLevel="h1">Power Monitoring Dashboard</Title>
        <Content component="p">
          Real-time power consumption metrics collected by Kepler (v2.0 - Compact Charts)
        </Content>
        
        {/* Filter Toolbar */}
        <Toolbar style={{ marginTop: '1rem', marginBottom: '1rem' }}>
          <ToolbarContent>
            <ToolbarItem>
              <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsXs' }}>
                <FlexItem>
                  <strong>Zone:</strong>
                </FlexItem>
                <FlexItem>
                  <FormSelect
                    value={zoneFilter}
                    onChange={(event, val) => setZoneFilter(val)}
                    aria-label="Zone filter"
                  >
                    {zones.map((zone) => (
                      <FormSelectOption key={zone} value={zone} label={zone} />
                    ))}
                  </FormSelect>
                </FlexItem>
              </Flex>
            </ToolbarItem>
            <ToolbarItem>
              <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsXs' }}>
                <FlexItem>
                  <strong>Namespace:</strong>
                </FlexItem>
                <FlexItem>
                  <FormSelect
                    value={namespaceFilter}
                    onChange={(event, val) => {
                      setNamespaceFilter(val);
                      setPodFilter('All'); // Reset pod filter when namespace changes
                    }}
                    aria-label="Namespace filter"
                  >
                    {namespaces.map((namespace) => (
                      <FormSelectOption key={namespace} value={namespace} label={namespace} />
                    ))}
                  </FormSelect>
                </FlexItem>
              </Flex>
            </ToolbarItem>
            <ToolbarItem>
              <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsXs' }}>
                <FlexItem>
                  <strong>Pod:</strong>
                </FlexItem>
                <FlexItem>
                  <FormSelect
                    value={podFilter}
                    onChange={(event, val) => setPodFilter(val)}
                    aria-label="Pod filter"
                    isDisabled={namespaceFilter === 'All'}
                  >
                    {pods.map((pod) => (
                      <FormSelectOption key={pod} value={pod} label={pod} />
                    ))}
                  </FormSelect>
                </FlexItem>
              </Flex>
            </ToolbarItem>
            <ToolbarItem>
              <Flex direction={{ default: 'column' }} spaceItems={{ default: 'spaceItemsXs' }}>
                <FlexItem>
                  <strong>Node:</strong>
                </FlexItem>
                <FlexItem>
                  <FormSelect
                    value={nodeFilter}
                    onChange={(event, val) => setNodeFilter(val)}
                    aria-label="Node filter"
                  >
                    {nodes.map((node) => (
                      <FormSelectOption key={node} value={node} label={node} />
                    ))}
                  </FormSelect>
                </FlexItem>
              </Flex>
            </ToolbarItem>
          </ToolbarContent>
        </Toolbar>
      </PageSection>

      {/* RAPL & Node Info Section */}
      <PageSection>
        <Title headingLevel="h2" size="xl">
          System Information
        </Title>
        <Grid hasGutter style={{ marginTop: '1rem' }}>
          <GridItem lg={6} md={12} sm={12}>
            <RAPLInfoCard />
          </GridItem>
          <GridItem lg={6} md={12} sm={12}>
            <CPUInfoCard />
          </GridItem>
        </Grid>
      </PageSection>

      {/* Cluster Wide Consumption Section */}
      <PageSection>
        <Title headingLevel="h2" size="xl">
          Cluster Wide Consumption
        </Title>
        <Grid hasGutter style={{ marginTop: '1rem' }}>
          <GridItem span={12}>
            <TotalClusterPowerCard />
          </GridItem>

          {/* Three zone tables in one row */}
          <GridItem lg={4} md={4} sm={12}>
            <PowerByZoneTable queryType="total" zoneFilter={zoneFilter} />
          </GridItem>

          <GridItem lg={4} md={4} sm={12}>
            <PowerByZoneTable queryType="active" zoneFilter={zoneFilter} />
          </GridItem>

          <GridItem lg={4} md={4} sm={12}>
            <PowerByZoneTable queryType="idle" zoneFilter={zoneFilter} />
          </GridItem>
        </Grid>
      </PageSection>

      {/* Node Consumption Section */}
      <PageSection>
        <Title headingLevel="h2" size="xl">
          Node Consumption
        </Title>
        <Grid hasGutter style={{ marginTop: '1rem' }}>
          <GridItem lg={12} md={12} sm={12}>
            <TopNodesCard />
          </GridItem>

          <GridItem lg={12} md={12} sm={12}>
            <PowerTrendCard zoneFilter={zoneFilter} />
          </GridItem>

          <GridItem lg={8} md={12} sm={12}>
            <NodePowerChart chartType="total" nodeFilter={nodeFilter} zoneFilter={zoneFilter} />
          </GridItem>

          <GridItem lg={8} md={12} sm={12}>
            <NodePowerChart chartType="active" nodeFilter={nodeFilter} zoneFilter={zoneFilter} />
          </GridItem>

          <GridItem lg={8} md={12} sm={12}>
            <NodePowerChart chartType="idle" nodeFilter={nodeFilter} zoneFilter={zoneFilter} />
          </GridItem>
        </Grid>
      </PageSection>

      {/* Namespace Consumption Section */}
      <PageSection>
        <Title headingLevel="h2" size="xl">
          Power Monitor - Namespace Info
        </Title>
        <Grid hasGutter style={{ marginTop: '1rem' }}>
          <GridItem lg={12} md={12} sm={12}>
            <TopNamespacesCard namespaceFilter={namespaceFilter} />
          </GridItem>

          <GridItem lg={12} md={12} sm={12}>
            <PodPowerChart 
              namespaceFilter={namespaceFilter}
              podFilter={podFilter}
              zoneFilter={zoneFilter}
            />
          </GridItem>
        </Grid>
      </PageSection>
    </>
  );
};

export default PowerMonitoringDashboard;
