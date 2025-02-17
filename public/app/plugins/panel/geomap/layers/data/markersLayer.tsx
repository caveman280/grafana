import React, { ReactNode } from 'react';
import {
  MapLayerRegistryItem,
  MapLayerOptions,
  PanelData,
  GrafanaTheme2,
  FrameGeometrySourceMode,
} from '@grafana/data';
import Map from 'ol/Map';
import Feature from 'ol/Feature';
import { Point } from 'ol/geom';
import * as layer from 'ol/layer';
import * as source from 'ol/source';
import { dataFrameToPoints, getLocationMatchers } from '../../utils/location';
import {
  getScaledDimension,
  getColorDimension,
  ResourceFolderName,
} from 'app/features/dimensions';
import { ScaleDimensionEditor, ColorDimensionEditor, ResourceDimensionEditor } from 'app/features/dimensions/editors';
import { ObservablePropsWrapper } from '../../components/ObservablePropsWrapper';
import { MarkersLegend, MarkersLegendProps } from './MarkersLegend';
import { ReplaySubject } from 'rxjs';
import { FeaturesStylesBuilderConfig, getFeatures } from '../../utils/getFeatures';
import { getMarkerMaker } from '../../style/markers';
import { defaultStyleConfig, StyleConfig } from '../../style/types';

// Configuration options for Circle overlays
export interface MarkersConfig {
  style: StyleConfig;
  showLegend?: boolean;
}

const defaultOptions: MarkersConfig = {
  style: defaultStyleConfig,
  showLegend: true,
};

export const MARKERS_LAYER_ID = 'markers';

// Used by default when nothing is configured
export const defaultMarkersConfig: MapLayerOptions<MarkersConfig> = {
  type: MARKERS_LAYER_ID,
  name: '', // will get replaced
  config: defaultOptions,
  location: {
    mode: FrameGeometrySourceMode.Auto,
  },
};

/**
 * Map layer configuration for circle overlay
 */
export const markersLayer: MapLayerRegistryItem<MarkersConfig> = {
  id: MARKERS_LAYER_ID,
  name: 'Markers',
  description: 'use markers to render each data point',
  isBaseMap: false,
  showLocation: true,

  /**
   * Function that configures transformation and returns a transformer
   * @param options
   */
  create: async (map: Map, options: MapLayerOptions<MarkersConfig>, theme: GrafanaTheme2) => {
    const matchers = await getLocationMatchers(options.location);
    const vectorLayer = new layer.Vector({});
    // Assert default values
    const config = {
      ...defaultOptions,
      ...options?.config,
    };

    const legendProps = new ReplaySubject<MarkersLegendProps>(1);
    let legend: ReactNode = null;
    if (config.showLegend) {
      legend = <ObservablePropsWrapper watch={legendProps} initialSubProps={{}} child={MarkersLegend} />;
    }

    const style = config.style ?? defaultStyleConfig;
    const markerMaker = await getMarkerMaker(style.symbol?.fixed);

    return {
      init: () => vectorLayer,
      legend: legend,
      update: (data: PanelData) => {
        if (!data.series?.length) {
          return; // ignore empty
        }

        const features: Feature<Point>[] = [];

        for (const frame of data.series) {
          const info = dataFrameToPoints(frame, matchers);
          if (info.warning) {
            console.log('Could not find locations', info.warning);
            continue; // ???
          }

          const colorDim = getColorDimension(frame, style.color ?? defaultStyleConfig.color, theme);
          const sizeDim = getScaledDimension(frame, style.size ?? defaultStyleConfig.size);
          const opacity = style?.opacity ?? defaultStyleConfig.opacity;

          const featureDimensionConfig: FeaturesStylesBuilderConfig = {
            colorDim: colorDim,
            sizeDim: sizeDim,
            opacity: opacity,
            styleMaker: markerMaker,
          };

          const frameFeatures = getFeatures(frame, info, featureDimensionConfig);

          if (frameFeatures) {
            features.push(...frameFeatures);
          }

          // Post updates to the legend component
          if (legend) {
            legendProps.next({
              color: colorDim,
              size: sizeDim,
            });
          }
          break; // Only the first frame for now!
        }

        // Source reads the data and provides a set of features to visualize
        const vectorSource = new source.Vector({ features });
        vectorLayer.setSource(vectorSource);
      },

      // Marker overlay options
      registerOptionsUI: (builder) => {
        builder
          .addCustomEditor({
            id: 'config.style.size',
            path: 'config.style.size',
            name: 'Marker Size',
            editor: ScaleDimensionEditor,
            settings: {
              min: 1,
              max: 100, // possible in the UI
            },
            defaultValue: defaultOptions.style.size,
          })
          .addCustomEditor({
            id: 'config.style.symbol',
            path: 'config.style.symbol',
            name: 'Marker Symbol',
            editor: ResourceDimensionEditor,
            defaultValue: defaultOptions.style.symbol,
            settings: {
              resourceType: 'icon',
              showSourceRadio: false,
              folderName: ResourceFolderName.Marker,
            },
          })
          .addCustomEditor({
            id: 'config.style.color',
            path: 'config.style.color',
            name: 'Marker Color',
            editor: ColorDimensionEditor,
            settings: {},
            defaultValue: defaultOptions.style.color,
          })
          .addSliderInput({
            path: 'config.style.opacity',
            name: 'Fill opacity',
            defaultValue: defaultOptions.style.opacity,
            settings: {
              min: 0,
              max: 1,
              step: 0.1,
            },
          })
          .addBooleanSwitch({
            path: 'config.showLegend',
            name: 'Show legend',
            description: 'Show legend',
            defaultValue: defaultOptions.showLegend,
          });
      },
    };
  },

  // fill in the default values
  defaultOptions,
};
