import { Transformer } from "../types/transformer";

export class OutputConfigTransformer implements Transformer {
  static TransformerName = 'outputconfig';
  name = 'outputconfig';

  async transformRequestIn(request: any): Promise<any> {
    if (request.output_config?.format) {
      const { format, ...restOutputConfig } = request.output_config;
      if (Object.keys(restOutputConfig).length === 0) {
        delete request.output_config;
      } else {
        request.output_config = restOutputConfig;
      }
    }
    return request;
  }
}